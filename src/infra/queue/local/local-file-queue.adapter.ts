/**
 * 로컬 파일 큐 어댑터
 * IJobQueuePort의 로컬 파일 시스템 기반 구현체
 *
 * 파일 기반으로 작업을 관리하며, 폴링 방식으로 처리합니다.
 * Redis 없이 간단한 환경에서 사용할 수 있습니다.
 *
 * 디렉토리 구조:
 * /data/queue/
 *   └── {queueName}/
 *       ├── waiting/   - 대기 중인 작업
 *       ├── active/    - 처리 중인 작업
 *       ├── completed/ - 완료된 작업
 *       ├── failed/    - 실패한 작업
 *       └── delayed/   - 지연된 작업
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  IJobQueuePort,
  Job,
  JobData,
  JobOptions,
  JobProcessor,
  JobStatus,
  QueueStats,
  ProcessorOptions,
} from '../../../domain/queue/ports/job-queue.port';

/**
 * 저장되는 작업 파일 구조
 */
interface JobFile<T = JobData> {
  job: Job<T>;
  options?: JobOptions;
  scheduledAt?: number; // delayed 작업의 실행 예정 시간
}

@Injectable()
export class LocalFileQueueAdapter implements IJobQueuePort, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LocalFileQueueAdapter.name);
  private readonly basePath: string;
  private readonly pollingInterval: number;
  private readonly processors: Map<string, JobProcessor> = new Map();
  private readonly concurrencyMap: Map<string, number> = new Map();
  private readonly activeJobsCount: Map<string, number> = new Map();
  private readonly pollingTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly pausedQueues: Set<string> = new Set();

  constructor(private readonly configService: ConfigService) {
    const configuredPath = this.configService.get<string>('QUEUE_LOCAL_PATH', 'queue');
    this.basePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(process.cwd(), configuredPath);
      
    this.pollingInterval = this.configService.get<number>('QUEUE_POLLING_INTERVAL', 3000);
    this.logger.log(`LocalFileQueueAdapter initialized - Path: ${this.basePath}`);
  }

  async onModuleInit(): Promise<void> {
    // 기본 디렉토리 생성
    await fs.mkdir(this.basePath, { recursive: true });
  }

  async onModuleDestroy(): Promise<void> {
    // 모든 폴링 타이머 정리
    for (const [queueName, timer] of this.pollingTimers) {
      clearInterval(timer);
      this.logger.log(`Polling stopped for queue: ${queueName}`);
    }
  }

  /**
   * 큐 디렉토리 경로 생성
   */
  private getQueuePath(queueName: string, status: JobStatus | 'delayed' = 'waiting'): string {
    return path.join(this.basePath, queueName, status);
  }

  /**
   * 작업 파일 경로 생성
   */
  private getJobFilePath(queueName: string, jobId: string, status: JobStatus | 'delayed'): string {
    return path.join(this.getQueuePath(queueName, status), `${jobId}.json`);
  }

  /**
   * 고유 작업 ID 생성
   */
  private generateJobId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * 작업 파일 저장
   */
  private async saveJobFile<T>(queueName: string, jobFile: JobFile<T>, status: JobStatus | 'delayed'): Promise<void> {
    const dirPath = this.getQueuePath(queueName, status);
    await fs.mkdir(dirPath, { recursive: true });

    const filePath = this.getJobFilePath(queueName, jobFile.job.id, status);
    await fs.writeFile(filePath, JSON.stringify(jobFile, null, 2));
  }

  /**
   * 작업 파일 읽기
   */
  private async readJobFile<T>(queueName: string, jobId: string, status: JobStatus | 'delayed'): Promise<JobFile<T> | null> {
    const filePath = this.getJobFilePath(queueName, jobId, status);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const jobFile = JSON.parse(content) as JobFile<T>;
      // Date 복원
      jobFile.job.createdAt = new Date(jobFile.job.createdAt);
      if (jobFile.job.processedAt) jobFile.job.processedAt = new Date(jobFile.job.processedAt);
      if (jobFile.job.completedAt) jobFile.job.completedAt = new Date(jobFile.job.completedAt);
      return jobFile;
    } catch (error: any) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  /**
   * 작업 파일 삭제
   */
  private async deleteJobFile(queueName: string, jobId: string, status: JobStatus | 'delayed'): Promise<void> {
    const filePath = this.getJobFilePath(queueName, jobId, status);
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  /**
   * 작업 파일 이동
   */
  private async moveJobFile<T>(
    queueName: string,
    jobFile: JobFile<T>,
    fromStatus: JobStatus | 'delayed',
    toStatus: JobStatus | 'delayed',
  ): Promise<void> {
    await this.deleteJobFile(queueName, jobFile.job.id, fromStatus);
    await this.saveJobFile(queueName, jobFile, toStatus);
  }

  /**
   * 디렉토리 내 작업 파일 목록 조회
   */
  private async listJobFiles(queueName: string, status: JobStatus | 'delayed'): Promise<string[]> {
    const dirPath = this.getQueuePath(queueName, status);
    try {
      const files = await fs.readdir(dirPath);
      return files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
    } catch (error: any) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async addJob<T = JobData>(queueName: string, data: T, options?: JobOptions): Promise<Job<T>> {
    const jobId = options?.jobId || this.generateJobId();
    const now = new Date();

    const job: Job<T> = {
      id: jobId,
      queueName,
      data,
      status: options?.delay ? 'delayed' : 'waiting',
      progress: 0,
      createdAt: now,
      attemptsMade: 0,
    };

    const jobFile: JobFile<T> = {
      job,
      options,
      scheduledAt: options?.delay ? Date.now() + options.delay : undefined,
    };

    const status = options?.delay ? 'delayed' : 'waiting';
    await this.saveJobFile(queueName, jobFile, status);
    this.logger.debug(`Job added to ${queueName}: ${jobId}`);

    return job;
  }

  async processJobs<T = JobData>(
    queueName: string,
    processor: JobProcessor<T>,
    options?: ProcessorOptions,
  ): Promise<void> {
    const concurrency = options?.concurrency ?? 1;
    this.processors.set(queueName, processor as JobProcessor);
    this.concurrencyMap.set(queueName, concurrency);
    this.activeJobsCount.set(queueName, 0);
    this.startPolling(queueName);
    this.logger.log(`Processor registered for queue: ${queueName} (concurrency: ${concurrency})`);
  }

  /**
   * 폴링 시작
   */
  private startPolling(queueName: string): void {
    if (this.pollingTimers.has(queueName)) return;

    const poll = async () => {
      if (this.pausedQueues.has(queueName)) return;

      try {
        // 지연 작업 확인 및 이동
        await this.checkDelayedJobs(queueName);

        // 대기 중인 작업 처리
        await this.processWaitingJobs(queueName);
      } catch (error) {
        this.logger.error(`Polling error for ${queueName}: ${error}`);
      }
    };

    // 즉시 실행 후 주기적 폴링
    poll();
    const timer = setInterval(poll, this.pollingInterval);
    this.pollingTimers.set(queueName, timer);
    this.logger.log(`Polling started for queue: ${queueName} (interval: ${this.pollingInterval}ms)`);
  }

  /**
   * 지연 작업 확인 및 waiting으로 이동
   */
  private async checkDelayedJobs(queueName: string): Promise<void> {
    const jobIds = await this.listJobFiles(queueName, 'delayed');
    const now = Date.now();

    for (const jobId of jobIds) {
      const jobFile = await this.readJobFile<JobData>(queueName, jobId, 'delayed');
      if (!jobFile) continue;

      if (jobFile.scheduledAt && jobFile.scheduledAt <= now) {
        jobFile.job.status = 'waiting';
        await this.moveJobFile(queueName, jobFile, 'delayed', 'waiting');
        this.logger.debug(`Delayed job moved to waiting: ${jobId}`);
      }
    }
  }

  /**
   * 대기 중인 작업 처리 (concurrency 지원)
   */
  private async processWaitingJobs(queueName: string): Promise<void> {
    const processor = this.processors.get(queueName);
    if (!processor) return;

    const concurrency = this.concurrencyMap.get(queueName) ?? 1;
    const activeCount = this.activeJobsCount.get(queueName) ?? 0;
    const availableSlots = concurrency - activeCount;

    if (availableSlots <= 0) return;

    const jobIds = await this.listJobFiles(queueName, 'waiting');

    // 우선순위 기반 정렬 (파일 이름 = timestamp 기반)
    jobIds.sort();

    // 동시 처리할 작업들 선택
    const jobsToProcess = jobIds.slice(0, availableSlots);

    // 각 작업을 비동기로 병렬 처리
    const processPromises = jobsToProcess.map(async (jobId) => {
      if (this.pausedQueues.has(queueName)) return;

      const jobFile = await this.readJobFile<JobData>(queueName, jobId, 'waiting');
      if (!jobFile) return;

      // active 카운트 증가
      this.activeJobsCount.set(
        queueName,
        (this.activeJobsCount.get(queueName) ?? 0) + 1,
      );

      // active로 이동
      jobFile.job.status = 'active';
      jobFile.job.processedAt = new Date();
      jobFile.job.attemptsMade = (jobFile.job.attemptsMade || 0) + 1;
      await this.moveJobFile(queueName, jobFile, 'waiting', 'active');

      try {
        // 작업 처리
        await processor(jobFile.job);

        // 완료 처리
        jobFile.job.status = 'completed';
        jobFile.job.completedAt = new Date();

        if (jobFile.options?.removeOnComplete) {
          await this.deleteJobFile(queueName, jobId, 'active');
        } else {
          await this.moveJobFile(queueName, jobFile, 'active', 'completed');
        }

        this.logger.debug(`Job completed: ${jobId}`);
      } catch (error: any) {
        // 실패 처리
        jobFile.job.failedReason = error.message;

        const maxAttempts = jobFile.options?.attempts || 1;
        if (jobFile.job.attemptsMade! < maxAttempts) {
          // 재시도: delayed로 이동
          jobFile.job.status = 'waiting';
          const backoff = jobFile.options?.backoff || 1000;
          jobFile.scheduledAt = Date.now() + backoff * jobFile.job.attemptsMade!;
          await this.moveJobFile(queueName, jobFile, 'active', 'delayed');
          this.logger.warn(`Job ${jobId} failed, will retry (attempt ${jobFile.job.attemptsMade}/${maxAttempts})`);
        } else {
          // 최종 실패
          jobFile.job.status = 'failed';

          if (jobFile.options?.removeOnFail) {
            await this.deleteJobFile(queueName, jobId, 'active');
          } else {
            await this.moveJobFile(queueName, jobFile, 'active', 'failed');
          }

          this.logger.error(`Job ${jobId} failed permanently: ${error.message}`);
        }
      } finally {
        // active 카운트 감소
        this.activeJobsCount.set(
          queueName,
          Math.max(0, (this.activeJobsCount.get(queueName) ?? 1) - 1),
        );
      }
    });

    // 모든 작업 병렬 실행 (에러 무시 - 개별 작업에서 처리됨)
    await Promise.allSettled(processPromises);
  }

  async getJob<T = JobData>(queueName: string, jobId: string): Promise<Job<T> | null> {
    // 모든 상태에서 검색
    const statuses: (JobStatus | 'delayed')[] = ['waiting', 'active', 'completed', 'failed', 'delayed'];

    for (const status of statuses) {
      const jobFile = await this.readJobFile<T>(queueName, jobId, status);
      if (jobFile) return jobFile.job;
    }

    return null;
  }

  async removeJob(queueName: string, jobId: string): Promise<void> {
    const statuses: (JobStatus | 'delayed')[] = ['waiting', 'active', 'completed', 'failed', 'delayed'];

    for (const status of statuses) {
      await this.deleteJobFile(queueName, jobId, status);
    }

    this.logger.debug(`Job removed: ${jobId}`);
  }

  async getWaitingCount(queueName: string): Promise<number> {
    const jobIds = await this.listJobFiles(queueName, 'waiting');
    return jobIds.length;
  }

  async getActiveCount(queueName: string): Promise<number> {
    const jobIds = await this.listJobFiles(queueName, 'active');
    return jobIds.length;
  }

  async getCompletedCount(queueName: string): Promise<number> {
    const jobIds = await this.listJobFiles(queueName, 'completed');
    return jobIds.length;
  }

  async getFailedCount(queueName: string): Promise<number> {
    const jobIds = await this.listJobFiles(queueName, 'failed');
    return jobIds.length;
  }

  async cleanQueue(queueName: string): Promise<void> {
    const completedPath = this.getQueuePath(queueName, 'completed');
    const failedPath = this.getQueuePath(queueName, 'failed');

    try {
      await fs.rm(completedPath, { recursive: true, force: true });
      await fs.rm(failedPath, { recursive: true, force: true });
      this.logger.log(`Queue cleaned: ${queueName}`);
    } catch (error) {
      this.logger.error(`Failed to clean queue ${queueName}: ${error}`);
    }
  }

  async pauseQueue(queueName: string): Promise<void> {
    this.pausedQueues.add(queueName);
    this.logger.log(`Queue paused: ${queueName}`);
  }

  async resumeQueue(queueName: string): Promise<void> {
    this.pausedQueues.delete(queueName);
    this.logger.log(`Queue resumed: ${queueName}`);
  }

  async getQueueStats(queueName: string): Promise<QueueStats> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.listJobFiles(queueName, 'waiting').then((files) => files.length),
      this.listJobFiles(queueName, 'active').then((files) => files.length),
      this.listJobFiles(queueName, 'completed').then((files) => files.length),
      this.listJobFiles(queueName, 'failed').then((files) => files.length),
      this.listJobFiles(queueName, 'delayed').then((files) => files.length),
    ]);
    return { waiting, active, completed, failed, delayed };
  }

  getAllQueueNames(): string[] {
    return Array.from(this.processors.keys());
  }
}
