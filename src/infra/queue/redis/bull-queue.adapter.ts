/**
 * Bull(Redis) 큐 어댑터
 * IJobQueuePort의 Redis 기반 Bull 구현체
 *
 * Bull은 Redis를 백엔드로 사용하는 Node.js 작업 큐입니다.
 * https://github.com/OptimalBits/bull
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Bull, { Queue, Job as BullJob } from 'bull';
import type {
  IJobQueuePort,
  Job,
  JobData,
  JobOptions,
  JobProcessor,
  JobStatus,
} from '../../../domain/queue/ports/job-queue.port';

@Injectable()
export class BullQueueAdapter implements IJobQueuePort, OnModuleDestroy {
  private readonly logger = new Logger(BullQueueAdapter.name);
  private readonly queues: Map<string, Queue> = new Map();
  private readonly redisConfig: { host: string; port: number; password?: string };

  constructor(private readonly configService: ConfigService) {
    this.redisConfig = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
    };
    this.logger.log(`BullQueueAdapter initialized - Redis: ${this.redisConfig.host}:${this.redisConfig.port}`);
  }

  /**
   * 큐 인스턴스 가져오기 (없으면 생성)
   */
  private getOrCreateQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      const queue = new Bull(queueName, {
        redis: this.redisConfig,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      });

      // 큐 이벤트 로깅
      queue.on('error', (error) => {
        this.logger.error(`Queue ${queueName} error: ${error.message}`);
      });

      queue.on('failed', (job, error) => {
        this.logger.warn(`Job ${job.id} in ${queueName} failed: ${error.message}`);
      });

      queue.on('completed', (job) => {
        this.logger.debug(`Job ${job.id} in ${queueName} completed`);
      });

      this.queues.set(queueName, queue);
      this.logger.log(`Queue created: ${queueName}`);
    }

    return this.queues.get(queueName)!;
  }

  /**
   * Bull Job을 Job 인터페이스로 변환
   */
  private mapBullJobToJob<T>(bullJob: BullJob<T>, queueName: string): Job<T> {
    return {
      id: bullJob.id.toString(),
      queueName,
      data: bullJob.data,
      status: this.mapBullStateToStatus(bullJob),
      progress: bullJob.progress() as number,
      createdAt: new Date(bullJob.timestamp),
      processedAt: bullJob.processedOn ? new Date(bullJob.processedOn) : undefined,
      completedAt: bullJob.finishedOn ? new Date(bullJob.finishedOn) : undefined,
      failedReason: bullJob.failedReason,
      attemptsMade: bullJob.attemptsMade,
    };
  }

  /**
   * Bull 상태를 JobStatus로 변환
   */
  private mapBullStateToStatus(bullJob: BullJob): JobStatus {
    if (bullJob.finishedOn && !bullJob.failedReason) return 'completed';
    if (bullJob.failedReason) return 'failed';
    if (bullJob.processedOn) return 'active';
    if (bullJob.opts.delay && bullJob.opts.delay > 0) return 'delayed';
    return 'waiting';
  }

  async addJob<T = JobData>(queueName: string, data: T, options?: JobOptions): Promise<Job<T>> {
    const queue = this.getOrCreateQueue(queueName);

    const bullOptions: Bull.JobOptions = {};
    if (options?.delay) bullOptions.delay = options.delay;
    if (options?.attempts) bullOptions.attempts = options.attempts;
    if (options?.backoff) bullOptions.backoff = options.backoff;
    if (options?.priority) bullOptions.priority = options.priority;
    if (options?.jobId) bullOptions.jobId = options.jobId;
    if (options?.removeOnComplete !== undefined) bullOptions.removeOnComplete = options.removeOnComplete;
    if (options?.removeOnFail !== undefined) bullOptions.removeOnFail = options.removeOnFail;

    const bullJob = await queue.add(data, bullOptions);
    this.logger.debug(`Job added to ${queueName}: ${bullJob.id}`);

    return this.mapBullJobToJob(bullJob, queueName);
  }

  async processJobs<T = JobData>(queueName: string, processor: JobProcessor<T>): Promise<void> {
    const queue = this.getOrCreateQueue(queueName);

    queue.process(async (bullJob: BullJob<T>) => {
      const job = this.mapBullJobToJob<T>(bullJob, queueName);
      await processor(job);
    });

    this.logger.log(`Processor registered for queue: ${queueName}`);
  }

  async getJob<T = JobData>(queueName: string, jobId: string): Promise<Job<T> | null> {
    const queue = this.getOrCreateQueue(queueName);
    const bullJob = await queue.getJob(jobId);

    if (!bullJob) return null;

    return this.mapBullJobToJob<T>(bullJob, queueName);
  }

  async removeJob(queueName: string, jobId: string): Promise<void> {
    const queue = this.getOrCreateQueue(queueName);
    const bullJob = await queue.getJob(jobId);

    if (bullJob) {
      await bullJob.remove();
      this.logger.debug(`Job removed from ${queueName}: ${jobId}`);
    }
  }

  async getWaitingCount(queueName: string): Promise<number> {
    const queue = this.getOrCreateQueue(queueName);
    return queue.getWaitingCount();
  }

  async getActiveCount(queueName: string): Promise<number> {
    const queue = this.getOrCreateQueue(queueName);
    return queue.getActiveCount();
  }

  async getCompletedCount(queueName: string): Promise<number> {
    const queue = this.getOrCreateQueue(queueName);
    return queue.getCompletedCount();
  }

  async getFailedCount(queueName: string): Promise<number> {
    const queue = this.getOrCreateQueue(queueName);
    return queue.getFailedCount();
  }

  async cleanQueue(queueName: string): Promise<void> {
    const queue = this.getOrCreateQueue(queueName);
    await queue.clean(0, 'completed');
    await queue.clean(0, 'failed');
    this.logger.log(`Queue cleaned: ${queueName}`);
  }

  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getOrCreateQueue(queueName);
    await queue.pause();
    this.logger.log(`Queue paused: ${queueName}`);
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getOrCreateQueue(queueName);
    await queue.resume();
    this.logger.log(`Queue resumed: ${queueName}`);
  }

  /**
   * 모듈 종료 시 모든 큐 연결 해제
   */
  async onModuleDestroy(): Promise<void> {
    for (const [name, queue] of this.queues) {
      await queue.close();
      this.logger.log(`Queue closed: ${name}`);
    }
  }
}
