/**
 * NFS 기반 NAS 어댑터
 * INasStoragePort의 NFS 구현체
 *
 * NFS 마운트 경로를 통해 NAS에 접근합니다.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { INasStoragePort } from '../../../../domain/storage/ports/nas-storage.port';

@Injectable()
export class NfsNasAdapter implements INasStoragePort {
  private readonly logger = new Logger(NfsNasAdapter.name);
  private readonly basePath: string;

  constructor(private readonly configService: ConfigService) {
    this.basePath = this.configService.get<string>('NAS_MOUNT_PATH', '/mnt/nas');
    this.logger.log(`NfsNasAdapter initialized with basePath: ${this.basePath}`);
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

  // ============================================
  // 파일 작업
  // ============================================

  async 파일쓰기(objectKey: string, data: Buffer): Promise<void> {
    const filePath = this.getFullPath(objectKey);
    await this.ensureDirectory(filePath);
    await fs.writeFile(filePath, data);
    this.logger.debug(`File written to NAS: ${objectKey}`);
  }

  async 파일스트림쓰기(objectKey: string, stream: Readable): Promise<void> {
    const filePath = this.getFullPath(objectKey);
    await this.ensureDirectory(filePath);

    const writeStream = createWriteStream(filePath);
    await pipeline(stream, writeStream);
    this.logger.debug(`File written to NAS (stream): ${objectKey}`);
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
      this.logger.debug(`File deleted from NAS: ${objectKey}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      this.logger.warn(`File not found for deletion on NAS: ${objectKey}`);
    }
  }

  async 파일이동(oldKey: string, newKey: string): Promise<void> {
    const oldPath = this.getFullPath(oldKey);
    const newPath = this.getFullPath(newKey);

    await this.ensureDirectory(newPath);
    await fs.rename(oldPath, newPath);
    this.logger.debug(`File moved on NAS: ${oldKey} -> ${newKey}`);
  }

  async 파일복사(sourceKey: string, destKey: string): Promise<void> {
    const sourcePath = this.getFullPath(sourceKey);
    const destPath = this.getFullPath(destKey);

    await this.ensureDirectory(destPath);
    await fs.copyFile(sourcePath, destPath);
    this.logger.debug(`File copied on NAS: ${sourceKey} -> ${destKey}`);
  }

  // ============================================
  // 폴더 작업
  // ============================================

  async 폴더생성(folderPath: string): Promise<void> {
    const fullPath = this.getFullPath(folderPath);
    await fs.mkdir(fullPath, { recursive: true });
    this.logger.debug(`Folder created on NAS: ${folderPath}`);
  }

  async 폴더삭제(folderPath: string, recursive: boolean = false): Promise<void> {
    const fullPath = this.getFullPath(folderPath);
    try {
      await fs.rm(fullPath, { recursive, force: recursive });
      this.logger.debug(`Folder deleted from NAS: ${folderPath} (recursive: ${recursive})`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      this.logger.warn(`Folder not found for deletion on NAS: ${folderPath}`);
    }
  }

  async 폴더이동(oldPath: string, newPath: string): Promise<void> {
    const oldFullPath = this.getFullPath(oldPath);
    const newFullPath = this.getFullPath(newPath);

    // 대상 부모 디렉토리 생성
    await fs.mkdir(path.dirname(newFullPath), { recursive: true });
    await fs.rename(oldFullPath, newFullPath);
    this.logger.debug(`Folder moved on NAS: ${oldPath} -> ${newPath}`);
  }

  // ============================================
  // 공통 작업
  // ============================================

  async 존재확인(objectKey: string): Promise<boolean> {
    const fullPath = this.getFullPath(objectKey);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async 파일크기조회(objectKey: string): Promise<number> {
    const fullPath = this.getFullPath(objectKey);
    const stats = await fs.stat(fullPath);
    return stats.size;
  }

  async 폴더내부항목조회(folderPath: string): Promise<string[]> {
    const fullPath = this.getFullPath(folderPath);
    try {
      const entries = await fs.readdir(fullPath);
      return entries;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}
