/**
 * 파일 기반 진행률 어댑터
 * IProgressStoragePort의 로컬 파일 시스템 기반 구현체
 *
 * LocalFileQueueAdapter와 동일한 패턴으로 파일 시스템에 진행률을 저장합니다.
 * Redis 없이 간단한 환경에서 사용할 수 있습니다.
 *
 * 디렉토리 구조:
 * /data/queue/progress/
 *   ├── {fileId-1}.json
 *   ├── {fileId-2}.json
 *   └── ...
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { IProgressStoragePort, SyncProgress } from '../../../domain/queue/ports/progress-storage.port';

const DEFAULT_TTL_MS = 3600000; // 1시간 (ms)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5분

@Injectable()
export class FileProgressAdapter implements IProgressStoragePort, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileProgressAdapter.name);
  private readonly basePath: string;
  private readonly ttlMs: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {
    const queuePath = this.configService.get<string>('QUEUE_LOCAL_PATH', 'queue');
    const base = path.isAbsolute(queuePath)
      ? queuePath
      : path.join(process.cwd(), queuePath);
    this.basePath = path.join(base, 'progress');
    this.ttlMs = this.configService.get<number>('PROGRESS_TTL_MS', DEFAULT_TTL_MS);
    this.logger.log(`FileProgressAdapter initialized - Path: ${this.basePath}, TTL: ${this.ttlMs}ms`);
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    this.startCleanupScheduler();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 만료된 파일 정리 스케줄러 시작
   */
  private startCleanupScheduler(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((error) => {
        this.logger.error(`Cleanup failed: ${error}`);
      });
    }, CLEANUP_INTERVAL_MS);
    this.logger.log('Cleanup scheduler started (interval: 5 min)');
  }

  /**
   * TTL이 지난 파일 삭제
   */
  private async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.basePath);
      const now = Date.now();
      let cleaned = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.basePath, file);
        try {
          const stat = await fs.stat(filePath);

          // mtime 기준 TTL 체크
          if (now - stat.mtimeMs > this.ttlMs) {
            await fs.unlink(filePath);
            cleaned++;
          }
        } catch (error) {
          // 파일이 이미 삭제된 경우 무시
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            this.logger.warn(`Failed to check/delete file ${file}: ${error}`);
          }
        }
      }

      if (cleaned > 0) {
        this.logger.debug(`Cleaned ${cleaned} expired progress files`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 파일 경로 생성
   */
  private getFilePath(syncEventId: string): string {
    return path.join(this.basePath, `${syncEventId}.json`);
  }

  async set(syncEventId: string, progress: SyncProgress): Promise<void> {
    const filePath = this.getFilePath(syncEventId);
    await fs.writeFile(filePath, JSON.stringify(progress, null, 2), 'utf-8');
    this.logger.debug(`Progress set: ${syncEventId} (${progress.progress.percent}%)`);
  }

  async get(syncEventId: string): Promise<SyncProgress | null> {
    const filePath = this.getFilePath(syncEventId);

    try {
      const stat = await fs.stat(filePath);

      // TTL 체크 (mtime 기준)
      if (Date.now() - stat.mtimeMs > this.ttlMs) {
        await fs.unlink(filePath).catch(() => {}); // 삭제 실패 무시
        return null;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async delete(syncEventId: string): Promise<void> {
    const filePath = this.getFilePath(syncEventId);
    try {
      await fs.unlink(filePath);
      this.logger.debug(`Progress deleted: ${syncEventId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async update(syncEventId: string, partial: Partial<SyncProgress>): Promise<void> {
    const existing = await this.get(syncEventId);
    if (!existing) {
      this.logger.warn(`Progress not found for update: ${syncEventId}`);
      return;
    }

    const updated: SyncProgress = {
      ...existing,
      ...partial,
      progress: {
        ...existing.progress,
        ...(partial.progress || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    await this.set(syncEventId, updated);
  }
}
