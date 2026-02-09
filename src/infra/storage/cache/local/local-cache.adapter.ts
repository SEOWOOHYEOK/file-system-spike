/**
 * 로컬 파일 시스템 캐시 어댑터
 * ICacheStoragePort의 로컬 파일 시스템 구현체
 *
 * 동시성 제어:
 * - FileLockManager를 통한 Read-Write Lock 적용
 * - 읽기: 동시 접근 허용, 쓰기: 배타적 잠금
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ICacheStoragePort } from '../../../../domain/storage/ports/cache-storage.port';
import { FileLockManager } from '../../file-lock.manager';

@Injectable()
export class LocalCacheAdapter implements ICacheStoragePort {
  private readonly logger = new Logger(LocalCacheAdapter.name);
  private readonly basePath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly lockManager: FileLockManager,
  ) {
    const configuredPath = this.configService.get<string>('CACHE_LOCAL_PATH', 'cache');
    // 절대 경로가 아니면 프로젝트 루트 기준으로 경로 설정
    this.basePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(process.cwd(), configuredPath);

    this.logger.log(`LocalCacheAdapter initialized with basePath: ${this.basePath}`);
  }

  /**
   * 전체 경로 생성
   */
  private getFullPath(objectKey: string): string {
    return path.join(this.basePath, objectKey);
  }

  /**
   * 디렉토리 생성 (없으면)
   */
  private async ensureDirectory(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  async 파일쓰기(objectKey: string, data: Buffer): Promise<void> {
    // 캐시 키에 prefix 추가하여 NAS 키와 구분
    const lockKey = `cache:${objectKey}`;
    const release = await this.lockManager.acquireWrite(lockKey);
    try {
      const filePath = this.getFullPath(objectKey);
      await this.ensureDirectory(filePath);
      await fs.writeFile(filePath, data);
      this.logger.debug(`File written: ${objectKey}`);
    } finally {
      release();
    }
  }

  async 파일스트림쓰기(objectKey: string, stream: Readable): Promise<void> {
    const lockKey = `cache:${objectKey}`;
    const release = await this.lockManager.acquireWrite(lockKey);
    try {
      const filePath = this.getFullPath(objectKey);
      await this.ensureDirectory(filePath);

      // 성능 최적화: highWaterMark 4MB (기본 64KB → 64배 증가)
      const writeStream = createWriteStream(filePath, {
        highWaterMark: 4 * 1024 * 1024,
      });
      await pipeline(stream, writeStream);
      this.logger.debug(`File written (stream): ${objectKey}`);
    } finally {
      release();
    }
  }

  async 파일읽기(objectKey: string): Promise<Buffer> {
    const lockKey = `cache:${objectKey}`;
    const release = await this.lockManager.acquireRead(lockKey);
    try {
      const filePath = this.getFullPath(objectKey);
      return await fs.readFile(filePath);
    } finally {
      release();
    }
  }

  async 파일스트림읽기(objectKey: string): Promise<Readable> {
    const lockKey = `cache:${objectKey}`;
    const release = await this.lockManager.acquireRead(lockKey);
    const filePath = this.getFullPath(objectKey);

    if (!existsSync(filePath)) {
      release();
      throw new Error(`File not found: ${objectKey}`);
    }

    const stream = createReadStream(filePath);
    // 스트림 종료 시 lock 해제
    stream.on('close', release);
    stream.on('error', release);
    return stream;
  }

  async 파일범위스트림읽기(objectKey: string, start: number, end: number): Promise<Readable> {
    const lockKey = `cache:${objectKey}`;
    const release = await this.lockManager.acquireRead(lockKey);
    const filePath = this.getFullPath(objectKey);

    if (!existsSync(filePath)) {
      release();
      throw new Error(`File not found: ${objectKey}`);
    }

    // Range 요청: start와 end는 inclusive
    const stream = createReadStream(filePath, { start, end });
    // 스트림 종료 시 lock 해제
    stream.on('close', release);
    stream.on('error', release);
    return stream;
  }

  async 파일삭제(objectKey: string): Promise<void> {
    const lockKey = `cache:${objectKey}`;
    const release = await this.lockManager.acquireWrite(lockKey);
    try {
      const filePath = this.getFullPath(objectKey);
      await fs.unlink(filePath);
      this.logger.debug(`File deleted: ${objectKey}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      this.logger.warn(`File not found for deletion: ${objectKey}`);
    } finally {
      release();
    }
  }

  async 파일존재확인(objectKey: string): Promise<boolean> {
    // 메타데이터만 조회하므로 Lock 불필요
    const filePath = this.getFullPath(objectKey);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async 파일이동(oldKey: string, newKey: string): Promise<void> {
    const oldLockKey = `cache:${oldKey}`;
    const newLockKey = `cache:${newKey}`;
    const release = await this.lockManager.acquireWriteMultiple([oldLockKey, newLockKey]);
    try {
      const oldPath = this.getFullPath(oldKey);
      const newPath = this.getFullPath(newKey);

      await this.ensureDirectory(newPath);
      await fs.rename(oldPath, newPath);
      this.logger.debug(`File moved: ${oldKey} -> ${newKey}`);
    } finally {
      release();
    }
  }

  async 파일크기조회(objectKey: string): Promise<number> {
    // 메타데이터만 조회하므로 Lock 불필요
    const filePath = this.getFullPath(objectKey);
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  async 디렉토리삭제(dirKey: string): Promise<void> {
    const dirPath = this.getFullPath(dirKey);
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      this.logger.debug(`Directory deleted: ${dirKey}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
