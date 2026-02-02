/**
 * 큐 상태 조회 서비스
 * Bull 큐의 현황을 조회합니다.
 */
import { Injectable, Inject } from '@nestjs/common';
import {
  JOB_QUEUE_PORT,
  QueueStats,
} from '../../domain/queue/ports/job-queue.port';
import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';

/**
 * NAS 동기화 관련 큐 이름 목록
 */
const NAS_SYNC_QUEUE_NAMES = [
  'NAS_SYNC_UPLOAD',
  'NAS_SYNC_RENAME',
  'NAS_SYNC_MOVE',
  'NAS_MOVE_TO_TRASH',
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
}
