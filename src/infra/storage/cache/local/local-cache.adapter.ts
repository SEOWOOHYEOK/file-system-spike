/**
 * 로컬 파일 시스템 캐시 어댑터
 * ICacheStoragePort의 로컬 파일 시스템 구현체
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ICacheStoragePort } from '../../../../domain/storage/ports/cache-storage.port';

@Injectable()
export class LocalCacheAdapter implements ICacheStoragePort {
  private readonly logger = new Logger(LocalCacheAdapter.name);
  private readonly basePath: string;

  constructor(private readonly configService: ConfigService) {
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
    const filePath = this.getFullPath(objectKey);
    await this.ensureDirectory(filePath);
    await fs.writeFile(filePath, data);
    this.logger.debug(`File written: ${objectKey}`);
  }

  async 파일스트림쓰기(objectKey: string, stream: Readable): Promise<void> {
    const filePath = this.getFullPath(objectKey);
    await this.ensureDirectory(filePath);

    const writeStream = createWriteStream(filePath);
    await pipeline(stream, writeStream);
    this.logger.debug(`File written (stream): ${objectKey}`);
  }

  async 파일읽기(objectKey: string): Promise<Buffer> {
    const filePath = this.getFullPath(objectKey);
    return fs.readFile(filePath);
  }

  async 파일스트림읽기(objectKey: string): Promise<Readable> {
    const filePath = this.getFullPath(objectKey);
    return createReadStream(filePath);
  }

  async 파일삭제(objectKey: string): Promise<void> {
    const filePath = this.getFullPath(objectKey);
    try {
      await fs.unlink(filePath);
      this.logger.debug(`File deleted: ${objectKey}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      this.logger.warn(`File not found for deletion: ${objectKey}`);
    }
  }

  async 파일존재확인(objectKey: string): Promise<boolean> {
    const filePath = this.getFullPath(objectKey);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async 파일이동(oldKey: string, newKey: string): Promise<void> {
    const oldPath = this.getFullPath(oldKey);
    const newPath = this.getFullPath(newKey);

    await this.ensureDirectory(newPath);
    await fs.rename(oldPath, newPath);
    this.logger.debug(`File moved: ${oldKey} -> ${newKey}`);
  }

  async 파일크기조회(objectKey: string): Promise<number> {
    const filePath = this.getFullPath(objectKey);
    const stats = await fs.stat(filePath);
    return stats.size;
  }
}
