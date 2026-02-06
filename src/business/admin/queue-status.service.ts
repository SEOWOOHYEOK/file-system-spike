/**
 * 큐 상태 조회 서비스
 * Bull 큐의 현황을 조회합니다.
 */
import { Injectable, Inject } from '@nestjs/common';
import {
  JOB_QUEUE_PORT,
  QueueStats,
  Job,
  JobsByStatusResult,
} from '../../domain/queue/ports/job-queue.port';
import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';

/**
 * NAS 동기화 관련 큐 이름 목록
 * - NAS_FILE_SYNC: 파일 동기화 통합 큐 (upload, rename, move, trash, restore, purge)
 * - NAS_FOLDER_SYNC: 폴더 동기화 통합 큐 (mkdir, rename, move, trash, restore, purge)
 */
const NAS_SYNC_QUEUE_NAMES = [
  'NAS_FILE_SYNC',
  'NAS_FOLDER_SYNC',
] as const;

/**
 * 개별 큐 상태 정보
 */
export interface QueueInfo {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

/**
 * 큐 상태 요약 정보
 */
export interface QueueSummary {
  totalWaiting: number;
  totalActive: number;
  totalFailed: number;
}

/**
 * 큐 상태 조회 결과
 */
export interface QueueStatusResult {
  queues: QueueInfo[];
  summary: QueueSummary;
  checkedAt: Date;
}

@Injectable()
export class QueueStatusService {
  constructor(
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
  ) {}

  /**
   * 모든 NAS 동기화 큐의 상태를 조회합니다.
   */
  async getQueueStatus(): Promise<QueueStatusResult> {
    const queues: QueueInfo[] = [];
    let totalWaiting = 0;
    let totalActive = 0;
    let totalFailed = 0;

    for (const queueName of NAS_SYNC_QUEUE_NAMES) {
      const stats = await this.jobQueue.getQueueStats(queueName);

      queues.push({
        name: queueName,
        ...stats,
      });

      totalWaiting += stats.waiting;
      totalActive += stats.active;
      totalFailed += stats.failed;
    }

    return {
      queues,
      summary: {
        totalWaiting,
        totalActive,
        totalFailed,
      },
      checkedAt: new Date(),
    };
  }

  /**
   * 특정 큐의 상태별 작업 목록 조회
   * @param queueName 큐 이름
   * @param limit 각 상태별 최대 조회 수
   */
  async getQueueJobs(queueName: string, limit: number = 50): Promise<QueueJobsResult> {
    const jobsByStatus = await this.jobQueue.getJobsByStatus(queueName, limit);
    const stats = await this.jobQueue.getQueueStats(queueName);

    return {
      queueName,
      waiting: jobsByStatus.waiting.map(this.mapJobToDto),
      active: jobsByStatus.active.map(this.mapJobToDto),
      delayed: jobsByStatus.delayed.map(this.mapJobToDto),
      failed: jobsByStatus.failed.map(this.mapJobToDto),
      completed: jobsByStatus.completed.map(this.mapJobToDto),
      summary: stats,
      checkedAt: new Date(),
    };
  }

  /**
   * 모든 NAS 동기화 큐의 작업 목록 조회
   * @param limit 각 상태별 최대 조회 수
   */
  async getAllQueueJobs(limit: number = 20): Promise<AllQueueJobsResult> {
    const results: QueueJobsResult[] = [];

    for (const queueName of NAS_SYNC_QUEUE_NAMES) {
      const result = await this.getQueueJobs(queueName, limit);
      results.push(result);
    }

    return {
      queues: results,
      checkedAt: new Date(),
    };
  }

  private mapJobToDto(job: Job): QueueJobDto {
    return {
      jobId: job.id,
      data: job.data,
      status: job.status,
      createdAt: job.createdAt,
      processedAt: job.processedAt,
      completedAt: job.completedAt,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
    };
  }
}

/**
 * 큐 작업 DTO
 */
export interface QueueJobDto {
  jobId: string;
  data: any;
  status: string;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failedReason?: string;
  attemptsMade?: number;
}

/**
 * 큐 작업 목록 조회 결과
 */
export interface QueueJobsResult {
  queueName: string;
  waiting: QueueJobDto[];
  active: QueueJobDto[];
  delayed: QueueJobDto[];
  failed: QueueJobDto[];
  completed: QueueJobDto[];
  summary: QueueStats;
  checkedAt: Date;
}

/**
 * 모든 큐 작업 목록 조회 결과
 */
export interface AllQueueJobsResult {
  queues: QueueJobsResult[];
  checkedAt: Date;
}
