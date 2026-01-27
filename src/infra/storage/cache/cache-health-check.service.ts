/**
 * Cache Health Check 도메인 서비스
 * 캐시 스토리지(Local)의 연결 상태를 확인합니다.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CACHE_STORAGE_PORT,
} from '../../../domain/storage/ports/cache-storage.port';
import type { ICacheStoragePort } from '../../../domain/storage/ports/cache-storage.port';

/**
 * 캐시 스토리지 건강 상태 결과
 */
export interface CacheHealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTimeMs: number;
  checkedAt: Date;
  error?: string;
}

@Injectable()
export class CacheHealthCheckService {
  private readonly logger = new Logger(CacheHealthCheckService.name);

  constructor(
    @Inject(CACHE_STORAGE_PORT)
    private readonly cacheStorage: ICacheStoragePort,
  ) { }

  /**
   * 캐시 스토리지 연결 상태 확인
   * 실제 파일 쓰기/읽기/삭제를 통해 스토리지 정상 동작 여부를 확인합니다.
   * @returns 캐시 스토리지의 건강 상태
   */
  async checkHealth(): Promise<CacheHealthResult> {
    const startTime = Date.now();
    const healthCheckKey = `__health_check__/${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const testData = `health_check_${Date.now()}`;
    const testBuffer = Buffer.from(testData, 'utf-8');

    try {
      await Promise.race([
        this.performHealthCheck(healthCheckKey, testBuffer, testData),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000),
        ),
      ]);

      const responseTime = Date.now() - startTime;

      return {
        status: responseTime > 1000 ? 'degraded' : 'healthy',
        responseTimeMs: responseTime,
        checkedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Cache health check failed: ${error}`);
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        checkedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      // 헬스체크 파일 정리 (에러 무시)
      try {
        await this.cacheStorage.파일삭제(healthCheckKey);
        this.logger.debug(`Health check file deleted: ${healthCheckKey}`);
      } catch {
        // 삭제 실패해도 무시 (파일이 없을 수 있음)
      }
    }
  }

  /**
   * 실제 헬스체크 수행
   * 1. 파일 쓰기
   * 2. 파일 읽기
   * 3. 내용 비교
   */
  private async performHealthCheck(
    healthCheckKey: string,
    testBuffer: Buffer,
    expectedContent: string,
  ): Promise<void> {
    // 1. 파일 쓰기
    await this.cacheStorage.파일쓰기(healthCheckKey, testBuffer);
    this.logger.debug(`Health check file written: ${healthCheckKey}`);

    // 2. 파일 읽기
    const readBuffer = await this.cacheStorage.파일읽기(healthCheckKey);
    const readContent = readBuffer.toString('utf-8');

    // 3. 내용 비교
    if (readContent !== expectedContent) {
      throw new Error(
        `Health check failed: content mismatch (expected: ${expectedContent}, got: ${readContent})`
      );
    }

    this.logger.debug(`Health check passed: content verified`);
  }
}
