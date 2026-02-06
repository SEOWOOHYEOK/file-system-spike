/**
 * 멀티파트 업로드 고아 파일 정리 스케줄러
 *
 * 만료/취소된 세션의 파트 파일과 고아 상태의 캐시 파일을 정리합니다.
 *
 * 정리 대상:
 * 1. 만료된 세션의 파트 파일 (캐시 스토리지)
 * 2. 취소된 세션의 파트 파일 (캐시 스토리지)
 * 3. 세션 없이 남아있는 고아 파트 파일 (multipart/ 디렉토리)
 */
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';

import { UploadSessionDomainService } from '../../../domain/upload-session/service/upload-session-domain.service';
import { UploadSessionStatus } from '../../../domain/upload-session';
import { CACHE_STORAGE_PORT } from '../../../domain/storage/ports/cache-storage.port';
import type { ICacheStoragePort } from '../../../domain/storage/ports/cache-storage.port';
import { UploadQueueService } from '../upload-queue.service';

/**
 * Cleanup 실행 결과
 */
interface CleanupResult {
  /** 정리된 세션 수 */
  cleanedSessions: number;
  /** 정리된 파트 파일 수 */
  cleanedParts: number;
  /** 해제된 공간 (bytes) */
  freedBytes: number;
  /** 에러 발생 수 */
  errorCount: number;
}

@Injectable()
export class MultipartOrphanCleanupScheduler {
  private readonly logger = new Logger(MultipartOrphanCleanupScheduler.name);

  /** 중복 실행 방지 플래그 */
  private isRunning = false;

  /** 만료된 세션 보존 기간 (기본: 24시간) */
  private readonly retentionHours: number;

  /** 한 번에 처리할 세션 수 */
  private readonly batchSize: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly uploadSessionDomainService: UploadSessionDomainService,
    @Inject(CACHE_STORAGE_PORT)
    private readonly cacheStorage: ICacheStoragePort,
    private readonly uploadQueueService: UploadQueueService,
  ) {
    this.retentionHours = this.configService.get<number>(
      'MULTIPART_CLEANUP_RETENTION_HOURS',
      24,
    );
    this.batchSize = this.configService.get<number>(
      'MULTIPART_CLEANUP_BATCH_SIZE',
      50,
    );
  }

  /**
   * 30분마다 고아 파일 정리 실행
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async runScheduledCleanup(): Promise<void> {
    await this.runCleanup();
  }

  /**
   * 고아 파일 정리 실행 (수동 호출 가능)
   */
  async runCleanup(): Promise<CleanupResult> {
    // 중복 실행 방지
    if (this.isRunning) {
      this.logger.warn('Cleanup already in progress, skipping...');
      return { cleanedSessions: 0, cleanedParts: 0, freedBytes: 0, errorCount: 0 };
    }

    this.isRunning = true;
    const startTime = Date.now();

    const result: CleanupResult = {
      cleanedSessions: 0,
      cleanedParts: 0,
      freedBytes: 0,
      errorCount: 0,
    };

    try {
      this.logger.log('Starting multipart orphan cleanup...');

      // 1. 만료된 세션 정리
      const expiredResult = await this.cleanupExpiredSessions();
      result.cleanedSessions += expiredResult.cleanedSessions;
      result.cleanedParts += expiredResult.cleanedParts;
      result.freedBytes += expiredResult.freedBytes;
      result.errorCount += expiredResult.errorCount;

      // 2. 취소된 세션 정리 (오래된 것만)
      const abortedResult = await this.cleanupAbortedSessions();
      result.cleanedSessions += abortedResult.cleanedSessions;
      result.cleanedParts += abortedResult.cleanedParts;
      result.freedBytes += abortedResult.freedBytes;
      result.errorCount += abortedResult.errorCount;

      const duration = Date.now() - startTime;
      this.logger.log(
        `Cleanup completed in ${duration}ms: ` +
        `sessions=${result.cleanedSessions}, parts=${result.cleanedParts}, ` +
        `freed=${this.formatBytes(result.freedBytes)}, errors=${result.errorCount}`,
      );

      // 세션 정리 후 대기열 승격 트리거
      if (result.cleanedSessions > 0) {
        try {
          await this.uploadQueueService.promoteNext();
        } catch (err) {
          this.logger.error('대기열 승격 실패', err);
        }
      }

      return result;
    } catch (error) {
      this.logger.error('Cleanup failed', error);
      result.errorCount++;
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 만료된 세션 정리
   */
  private async cleanupExpiredSessions(): Promise<CleanupResult> {
    const result: CleanupResult = {
      cleanedSessions: 0,
      cleanedParts: 0,
      freedBytes: 0,
      errorCount: 0,
    };

    try {
      // 만료된 세션 조회
      const expiredSessions = await this.uploadSessionDomainService.만료세션조회(this.batchSize);

      if (expiredSessions.length === 0) {
        return result;
      }

      this.logger.log(`Found ${expiredSessions.length} expired sessions to cleanup`);

      for (const session of expiredSessions) {
        try {
          const partResult = await this.cleanupSessionParts(session.id);
          result.cleanedParts += partResult.cleanedParts;
          result.freedBytes += partResult.freedBytes;
          result.errorCount += partResult.errorCount;

          // 세션 및 파트 레코드 삭제
          await this.uploadSessionDomainService.세션파트일괄삭제(session.id);
          await this.uploadSessionDomainService.세션삭제(session.id);

          result.cleanedSessions++;
          this.logger.debug(`Cleaned up expired session: ${session.id}`);
        } catch (error) {
          result.errorCount++;
          this.logger.error(`Failed to cleanup expired session ${session.id}:`, error);
        }
      }
    } catch (error) {
      result.errorCount++;
      this.logger.error('Failed to query expired sessions:', error);
    }

    return result;
  }

  /**
   * 취소된 세션 정리 (보존 기간이 지난 것만)
   */
  private async cleanupAbortedSessions(): Promise<CleanupResult> {
    const result: CleanupResult = {
      cleanedSessions: 0,
      cleanedParts: 0,
      freedBytes: 0,
      errorCount: 0,
    };

    try {
      // 취소/만료 상태인 세션 중 보존 기간이 지난 것 조회
      const cutoffTime = new Date(Date.now() - this.retentionHours * 60 * 60 * 1000);
      // COMPLETING 상태는 NAS sync + concat이 오래 걸릴 수 있으므로 보존 기간 2배 적용
      const completingCutoffTime = new Date(Date.now() - this.retentionHours * 2 * 60 * 60 * 1000);

      const [abortedSessions, stuckCompletingSessions] = await Promise.all([
        this.uploadSessionDomainService.세션목록조회({
          status: [UploadSessionStatus.ABORTED, UploadSessionStatus.EXPIRED],
          updatedBefore: cutoffTime,
          limit: this.batchSize,
        }),
        // COMPLETING 상태가 오래 지속된 세션 (worker 실패 등)
        this.uploadSessionDomainService.세션목록조회({
          status: [UploadSessionStatus.COMPLETING],
          updatedBefore: completingCutoffTime,
          limit: this.batchSize,
        }),
      ]);

      // 두 목록 합치기
      abortedSessions.push(...stuckCompletingSessions);

      if (abortedSessions.length === 0) {
        return result;
      }

      this.logger.log(`Found ${abortedSessions.length} aborted/expired sessions to cleanup`);

      for (const session of abortedSessions) {
        try {
          const partResult = await this.cleanupSessionParts(session.id);
          result.cleanedParts += partResult.cleanedParts;
          result.freedBytes += partResult.freedBytes;
          result.errorCount += partResult.errorCount;

          // 세션 및 파트 레코드 삭제
          await this.uploadSessionDomainService.세션파트일괄삭제(session.id);
          await this.uploadSessionDomainService.세션삭제(session.id);

          result.cleanedSessions++;
          this.logger.debug(`Cleaned up aborted session: ${session.id}`);
        } catch (error) {
          result.errorCount++;
          this.logger.error(`Failed to cleanup aborted session ${session.id}:`, error);
        }
      }
    } catch (error) {
      result.errorCount++;
      this.logger.error('Failed to query aborted sessions:', error);
    }

    return result;
  }

  /**
   * 세션의 파트 파일 정리
   */
  private async cleanupSessionParts(sessionId: string): Promise<{
    cleanedParts: number;
    freedBytes: number;
    errorCount: number;
  }> {
    let cleanedParts = 0;
    let freedBytes = 0;
    let errorCount = 0;

    try {
      const parts = await this.uploadSessionDomainService.세션파트목록조회(sessionId);

      for (const part of parts) {
        if (!part.objectKey) {
          continue;
        }

        try {
          // 파일 크기 조회
          let fileSize = 0;
          try {
            fileSize = await this.cacheStorage.파일크기조회(part.objectKey);
          } catch {
            // 파일이 이미 삭제된 경우
          }

          // 파트 파일 삭제
          await this.cacheStorage.파일삭제(part.objectKey);
          cleanedParts++;
          freedBytes += fileSize;
        } catch (error) {
          errorCount++;
          this.logger.warn(`Failed to delete part file: ${part.objectKey}`, error);
        }
      }
    } catch (error) {
      errorCount++;
      this.logger.error(`Failed to query parts for session ${sessionId}:`, error);
    }

    return { cleanedParts, freedBytes, errorCount };
  }

  /**
   * 바이트를 읽기 쉬운 형식으로 변환
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
  }

  /**
   * 현재 상태 조회 (Admin API용)
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    retentionHours: number;
    batchSize: number;
    pendingExpiredSessions: number;
    pendingAbortedSessions: number;
  }> {
    const cutoffTime = new Date(Date.now() - this.retentionHours * 60 * 60 * 1000);

    const [expiredSessions, abortedSessions, stuckCompletingSessions] = await Promise.all([
      this.uploadSessionDomainService.만료세션조회(1000),
      this.uploadSessionDomainService.세션목록조회({
        status: [UploadSessionStatus.ABORTED, UploadSessionStatus.EXPIRED],
        updatedBefore: cutoffTime,
        limit: 1000,
      }),
      this.uploadSessionDomainService.세션목록조회({
        status: [UploadSessionStatus.COMPLETING],
        updatedBefore: new Date(Date.now() - this.retentionHours * 2 * 60 * 60 * 1000),
        limit: 1000,
      }),
    ]);

    return {
      isRunning: this.isRunning,
      retentionHours: this.retentionHours,
      batchSize: this.batchSize,
      pendingExpiredSessions: expiredSessions.length,
      pendingAbortedSessions: abortedSessions.length + stuckCompletingSessions.length,
    };
  }
}
