/**
 * 캐시 Eviction Worker
 *
 * 캐시 용량이 임계값을 초과하면 LRU 정책에 따라 파일을 자동으로 제거합니다.
 * - 10분마다 실행 (환경변수로 조정 가능)
 * - NAS에 동기화 완료된 파일만 제거
 * - leaseCount > 0인 파일(다운로드 중)은 제거하지 않음
 */
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

import {
  FILE_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/storage';
import {
  CACHE_STORAGE_PORT,
} from '../../domain/storage/ports/cache-storage.port';
import type { CacheDetailedStats } from '../../domain/storage/file/repositories/file-storage-object.repository.interface';

import type { IFileStorageObjectRepository } from '../../domain/storage';
import type { ICacheStoragePort } from '../../domain/storage/ports/cache-storage.port';

/**
 * Eviction 실행 결과
 */
interface EvictionResult {
  /** 제거된 파일 수 */
  evictedCount: number;
  /** 해제된 공간 (bytes) */
  freedBytes: number;
  /** 건너뛴 파일 수 (lease 중 등) */
  skippedCount: number;
  /** 에러 발생 수 */
  errorCount: number;
}

@Injectable()
export class CacheEvictionWorker {
  private readonly logger = new Logger(CacheEvictionWorker.name);

  /** 중복 실행 방지 플래그 */
  private isRunning = false;

  /** 캐시 최대 크기 (bytes) - 기본 10GB */
  private readonly maxSizeBytes: number;

  /** Eviction 시작 임계값 (%) - 기본 80% */
  private readonly thresholdPercent: number;

  /** Eviction 목표 (%) - 기본 70% */
  private readonly targetPercent: number;

  /** 한 번에 처리할 파일 수 - 기본 100 */
  private readonly batchSize: number;

  /** 캐시 로컬 경로 */
  private readonly cachePath: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(FILE_STORAGE_OBJECT_REPOSITORY)
    private readonly fileStorageObjectRepository: IFileStorageObjectRepository,
    @Inject(CACHE_STORAGE_PORT)
    private readonly cacheStorage: ICacheStoragePort,
  ) {
    this.maxSizeBytes = this.configService.get<number>(
      'CACHE_MAX_SIZE_BYTES',
      10 * 1024 * 1024 * 1024, // 10GB
    );
    this.thresholdPercent = this.configService.get<number>(
      'CACHE_THRESHOLD_PERCENT',
      80,
    );
    this.targetPercent = this.configService.get<number>(
      'CACHE_TARGET_PERCENT',
      70,
    );
    this.batchSize = this.configService.get<number>(
      'CACHE_EVICTION_BATCH_SIZE',
      100,
    );
    this.cachePath = this.configService.get<string>(
      'CACHE_LOCAL_PATH',
      '/data/cache',
    );
  }

  /**
   * 10분마다 캐시 Eviction 실행
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async runScheduledEviction(): Promise<void> {
    await this.runEviction();
  }

  /**
   * 캐시 Eviction 실행 (수동 호출 가능)
   */
  async runEviction(): Promise<EvictionResult> {
    // 중복 실행 방지
    if (this.isRunning) {
      this.logger.warn('Eviction already in progress, skipping...');
      return { evictedCount: 0, freedBytes: 0, skippedCount: 0, errorCount: 0 };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.logger.log('Starting cache eviction check...');

      // 1. 현재 캐시 사용량 확인
      const currentUsage = await this.getCacheUsage();
      const usagePercent = (currentUsage / this.maxSizeBytes) * 100;

      this.logger.log(
        `Cache usage: ${this.formatBytes(currentUsage)} / ${this.formatBytes(this.maxSizeBytes)} ` +
        `(${usagePercent.toFixed(1)}%)`,
      );

      // 2. 임계값 미만이면 종료
      if (usagePercent < this.thresholdPercent) {
        this.logger.log(
          `Usage ${usagePercent.toFixed(1)}% is below threshold ${this.thresholdPercent}%, no eviction needed.`,
        );
        return { evictedCount: 0, freedBytes: 0, skippedCount: 0, errorCount: 0 };
      }

      // 3. 목표 사용량 계산
      const targetBytes = (this.targetPercent / 100) * this.maxSizeBytes;
      const bytesToFree = currentUsage - targetBytes;

      this.logger.log(
        `Eviction required: need to free ${this.formatBytes(bytesToFree)} ` +
        `(target: ${this.targetPercent}%)`,
      );

      // 4. Eviction 실행
      const result = await this.performEviction(bytesToFree);

      const duration = Date.now() - startTime;
      this.logger.log(
        `Eviction completed in ${duration}ms: ` +
        `evicted=${result.evictedCount}, freed=${this.formatBytes(result.freedBytes)}, ` +
        `skipped=${result.skippedCount}, errors=${result.errorCount}`,
      );

      return result;
    } catch (error) {
      this.logger.error('Eviction failed', error);
      return { evictedCount: 0, freedBytes: 0, skippedCount: 0, errorCount: 1 };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 캐시 사용량 조회 (bytes)
   */
  async getCacheUsage(): Promise<number> {
    try {
      const stats = await this.calculateDirectoryStats(this.cachePath);
      return stats.totalBytes;
    } catch (error) {
      this.logger.error(`Failed to calculate cache size: ${this.cachePath}`, error);
      return 0;
    }
  }

  /**
   * 캐시 사용 현황 상세 조회 (Admin API용)
   * DB 정보 + 실제 디스크 정보 + 미동기화 현황 포함
   */
  async getCacheStatus(): Promise<{
    currentBytes: number;
    maxBytes: number;
    usagePercent: number;
    thresholdPercent: number;
    targetPercent: number;
    db: CacheDetailedStats;
    disk: { fileCount: number; totalBytes: number };
  }> {
    // DB 통계와 디스크 통계를 병렬 조회
    const [dbStats, diskStats] = await Promise.all([
      this.fileStorageObjectRepository.getCacheDetailedStats(),
      this.getDiskStats(),
    ]);

    const currentBytes = diskStats.totalBytes;

    return {
      currentBytes,
      maxBytes: this.maxSizeBytes,
      usagePercent: (currentBytes / this.maxSizeBytes) * 100,
      thresholdPercent: this.thresholdPercent,
      targetPercent: this.targetPercent,
      db: dbStats,
      disk: diskStats,
    };
  }

  /**
   * 디스크 실제 파일 통계 조회 (파일 수 + 총 용량)
   */
  private async getDiskStats(): Promise<{ fileCount: number; totalBytes: number }> {
    try {
      return await this.calculateDirectoryStats(this.cachePath);
    } catch (error) {
      this.logger.error(`Failed to calculate disk stats: ${this.cachePath}`, error);
      return { fileCount: 0, totalBytes: 0 };
    }
  }

  /**
   * 실제 Eviction 수행
   */
  private async performEviction(bytesToFree: number): Promise<EvictionResult> {
    let freedBytes = 0;
    let evictedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    while (freedBytes < bytesToFree) {
      // LRU 기준으로 제거 대상 조회
      const candidates = await this.fileStorageObjectRepository.findEvictionCandidatesLRU(
        this.batchSize,
      );

      if (candidates.length === 0) {
        this.logger.warn('No more eviction candidates available');
        break;
      }

      for (const candidate of candidates) {
        if (freedBytes >= bytesToFree) {
          break;
        }

        try {
          // Atomic Mark: AVAILABLE -> EVICTING
          const affected = await this.fileStorageObjectRepository.tryMarkEvicting(
            candidate.fileId,
          );

          if (affected === 0) {
            // 이미 lease 중이거나 상태가 변경됨
            skippedCount++;
            this.logger.debug(
              `Skipped file ${candidate.fileId}: already in use or status changed`,
            );
            continue;
          }

          // 파일 크기 조회
          let fileSize = 0;
          try {
            fileSize = await this.cacheStorage.파일크기조회(candidate.objectKey);
          } catch {
            // 파일이 없으면 0으로 처리
            this.logger.debug(`File size unknown for ${candidate.objectKey}`);
          }

          // 캐시 파일 삭제
          try {
            await this.cacheStorage.파일삭제(candidate.objectKey);
          } catch (deleteError) {
            this.logger.warn(
              `Failed to delete cache file: ${candidate.objectKey}`,
              deleteError,
            );
            // 파일 삭제 실패해도 DB 레코드는 삭제 (orphan 정리)
          }

          // DB 레코드 삭제
          await this.fileStorageObjectRepository.deleteCacheRecord(candidate.fileId);

          freedBytes += fileSize;
          evictedCount++;

          this.logger.debug(
            `Evicted file: ${candidate.fileId} (${this.formatBytes(fileSize)})`,
          );
        } catch (error) {
          errorCount++;
          this.logger.error(`Failed to evict file ${candidate.fileId}`, error);
        }
      }
    }

    return { evictedCount, freedBytes, skippedCount, errorCount };
  }

  /**
   * 디렉토리 통계 계산 (재귀) - 파일 수 + 총 용량
   */
  private async calculateDirectoryStats(
    dirPath: string,
  ): Promise<{ fileCount: number; totalBytes: number }> {
    let totalBytes = 0;
    let fileCount = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const sub = await this.calculateDirectoryStats(fullPath);
          totalBytes += sub.totalBytes;
          fileCount += sub.fileCount;
        } else if (entry.isFile()) {
          try {
            const stat = await fs.stat(fullPath);
            totalBytes += stat.size;
            fileCount++;
          } catch {
            // 파일 접근 실패 시 무시
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Failed to read directory: ${dirPath}`);
      }
    }

    return { fileCount, totalBytes };
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
}
