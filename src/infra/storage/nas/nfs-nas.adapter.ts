/**
 * NFS 기반 NAS 어댑터
 * INasStoragePort의 NFS 구현체
 *
 * NasClientProvider를 통해 경로를 관리하고 NAS에 접근합니다.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { INasStoragePort } from '../../../domain/storage/ports/nas-storage.port';
import { NasClientProvider } from './nas-client.provider';
import { InternalServerErrorException } from '@nestjs/common/exceptions/internal-server-error.exception'
import { NotFoundException } from '@nestjs/common/exceptions/not-found.exception';

/**
 * 파일 정보 결과 타입
 */
export interface FileInfoResult {
  contentType: string;
  contentLength: number;
  createdAt: Date;
  lastModified: Date;
}

/**
 * 파일 다운로드 결과 타입
 */
export interface FileDownloadResult {
  stream: Readable;
  contentType: string;
  contentLength: number;
  filename: string;
}

@Injectable()
export class NfsNasAdapter implements INasStoragePort {
  private readonly logger = new Logger(NfsNasAdapter.name);

  constructor(private readonly clientProvider: NasClientProvider) {
    this.logger.log(`NfsNasAdapter initialized with basePath: ${this.clientProvider.getRootPath()}`);
  }

  // ============================================
  // Private 유틸리티 메서드
  // ============================================

  /**
   * 디렉토리 생성 (없으면)
   */
  private async ensureDirectory(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      this.logger.debug(`📁 부모 디렉토리 생성: ${dir}`);
    }
  }

  /**
   * MIME 타입 조회
   */
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.xml': 'application/xml',
      '.csv': 'text/csv',
    };
    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
  }

  // ============================================
  // 파일 작업 (INasStoragePort 구현)
  // ============================================

  async 파일쓰기(objectKey: string, data: Buffer): Promise<void> {
    const filePath = this.clientProvider.validateAndCreatePath(objectKey);
    await this.ensureDirectory(filePath);
    
    try {
      await fs.writeFile(filePath, data);
      
      // 파일 저장 검증
      const stats = await fs.stat(filePath);
      if (stats.size === 0 && data.length > 0) {
         throw new Error('파일이 생성되었으나 내용이 비어있습니다.');
      }

      this.logger.debug(`📝 파일 저장 완료: ${objectKey} (${data.length} bytes)`);
    } catch (error: any) {
      throw new InternalServerErrorException(`파일 저장 실패: ${error.message}`);
    }
  }

  async 파일스트림쓰기(objectKey: string, stream: Readable): Promise<void> {
    const filePath = this.clientProvider.validateAndCreatePath(objectKey);
    await this.ensureDirectory(filePath);

    try {
      const writeStream = fsSync.createWriteStream(filePath);
      await pipeline(stream, writeStream);

      
      // 파일 저장 검증
      const stats = await fs.stat(filePath);
      if (stats.size === 0) {
         // 스트림의 경우 원본 크기를 모를 수 있으나, 0바이트 파일은 의심스러움 (빈 파일 업로드가 아니라면)
         // 여기서는 경고만 하거나, 비즈니스 로직에 따라 에러 처리
         this.logger.warn(`⚠️ 0바이트 파일이 저장되었습니다: ${objectKey}`);
         throw new Error('파일이 생성되었으나 내용이 비어있습니다.');
      }

      this.logger.debug(`📝 파일 스트림 저장 완료: ${objectKey}`);
    } catch (error: any) {
      throw new InternalServerErrorException(`파일 스트림 저장 실패: ${error.message}`);
    }
  }

  async 파일읽기(objectKey: string): Promise<Buffer> {
    const filePath = this.clientProvider.validateAndCreatePath(objectKey);
    
    try {
      return await fs.readFile(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException(`파일을 찾을 수 없습니다: ${objectKey}`);
      }
      throw new InternalServerErrorException(`파일 읽기 실패: ${error.message}`);
    }
  }

  async 파일스트림읽기(objectKey: string): Promise<Readable> {
    const filePath = this.clientProvider.validateAndCreatePath(objectKey);
    
    if (!fsSync.existsSync(filePath)) {
      throw new NotFoundException(`파일을 찾을 수 없습니다: ${objectKey}`);
    }

    return fsSync.createReadStream(filePath);
  }

  async 파일삭제(objectKey: string): Promise<void> {
    const filePath = this.clientProvider.validateAndCreatePath(objectKey);
    
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException(`파일을 찾을 수 없습니다: ${objectKey}`);
    }

    try {
      await fs.unlink(filePath);
      this.logger.log(`🗑️ 파일 삭제 완료: ${filePath}`);
    } catch (error: any) {
      throw new InternalServerErrorException(`삭제 실패: ${error.message}`);
    }
  }

  async 파일이동(oldKey: string, newKey: string): Promise<void> {
    const oldPath = this.clientProvider.validateAndCreatePath(oldKey);
    const newPath = this.clientProvider.validateAndCreatePath(newKey);

    // 원본 파일 존재 확인
    try {
      await fs.access(oldPath);
    } catch {
      throw new NotFoundException(`원본 파일을 찾을 수 없습니다: ${oldKey}`);
    }

    // 대상 디렉토리 생성
    const destDir = path.dirname(newPath);
    await fs.mkdir(destDir, { recursive: true });

    try {
      await fs.rename(oldPath, newPath);
      this.logger.log(`📁 Moved: ${oldKey} → ${newKey}`);
    } catch (error: any) {
      if (error.code === 'EXDEV') {
        // 다른 드라이브 간 이동
        await fs.copyFile(oldPath, newPath);
        await fs.unlink(oldPath);
        this.logger.log(`📁 Moved (cross-device): ${oldKey} → ${newKey}`);
      } else {
        throw new InternalServerErrorException(`이동 실패: ${error.message}`);
      }
    }
  }

  async 파일복사(sourceKey: string, destKey: string): Promise<void> {
    const sourcePath = this.clientProvider.validateAndCreatePath(sourceKey);
    const destPath = this.clientProvider.validateAndCreatePath(destKey);

    // 원본 파일 존재 확인
    try {
      await fs.access(sourcePath);
    } catch {
      throw new NotFoundException(`원본 파일을 찾을 수 없습니다: ${sourceKey}`);
    }

    await this.ensureDirectory(destPath);
    
    try {
      await fs.copyFile(sourcePath, destPath);
      this.logger.debug(`📋 파일 복사 완료: ${sourceKey} → ${destKey}`);
    } catch (error: any) {
      throw new InternalServerErrorException(`복사 실패: ${error.message}`);
    }
  }

  // ============================================
  // 폴더 작업 (INasStoragePort 구현)
  // ============================================

  async 폴더생성(folderPath: string): Promise<void> {
    const fullPath = this.clientProvider.validateAndCreatePath(folderPath);
    
    // 이미 존재하는지 확인
    try {
      await fs.access(fullPath);
      this.logger.debug(`📁 디렉토리 이미 존재: ${folderPath}`);
      return;
    } catch {
      // 존재하지 않으면 생성 진행
    }

    try {
      await fs.mkdir(fullPath, { recursive: true });
      this.logger.log(`📁 디렉토리 생성 완료: ${fullPath}`);
    } catch (error: any) {
      throw new InternalServerErrorException(`디렉토리 생성 실패: ${error.message}`);
    }
  }

  async 폴더삭제(folderPath: string, recursive: boolean = false): Promise<void> {
    const fullPath = this.clientProvider.validateAndCreatePath(folderPath);
    
    // 존재 확인
    try {
      await fs.access(fullPath);
    } catch {
      throw new NotFoundException(`디렉토리를 찾을 수 없습니다: ${folderPath}`);
    }

    try {
      await fs.rm(fullPath, { recursive, force: recursive });
      this.logger.log(`🗑️ 디렉토리 삭제 완료: ${fullPath}`);
    } catch (error: any) {
      throw new InternalServerErrorException(`디렉토리 삭제 실패: ${error.message}`);
    }
  }

  async 폴더이동(oldPath: string, newPath: string): Promise<void> {
    const oldFullPath = this.clientProvider.validateAndCreatePath(oldPath);
    const newFullPath = this.clientProvider.validateAndCreatePath(newPath);

    // 원본 디렉토리 존재 확인
    try {
      const stats = await fs.stat(oldFullPath);
      if (!stats.isDirectory()) {
        throw new InternalServerErrorException(`경로가 디렉토리가 아닙니다: ${oldPath}`);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException(`원본 디렉토리를 찾을 수 없습니다: ${oldPath}`);
      }
      throw error;
    }

    // 대상 부모 디렉토리 생성
    const destParent = path.dirname(newFullPath);
    await fs.mkdir(destParent, { recursive: true });

    try {
      await fs.rename(oldFullPath, newFullPath);
      this.logger.log(`📁 Moved directory: ${oldPath} → ${newPath}`);
    } catch (error: any) {
      if (error.code === 'EXDEV') {
        // 다른 드라이브 간 이동
        await this.copyDirectoryRecursive(oldFullPath, newFullPath);
        await fs.rm(oldFullPath, { recursive: true, force: true });
        this.logger.log(`📁 Moved directory (cross-device): ${oldPath} → ${newPath}`);
      } else {
        throw new InternalServerErrorException(`이동 실패: ${error.message}`);
      }
    }
  }

  /**
   * 디렉토리 재귀적 복사 (EXDEV 대응용)
   */
  private async copyDirectoryRecursive(source: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectoryRecursive(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  // ============================================
  // 공통 작업 (INasStoragePort 구현)
  // ============================================

  async 존재확인(objectKey: string): Promise<boolean> {
    try {
      const fullPath = this.clientProvider.validateAndCreatePath(objectKey);
      await fs.access(fullPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async 파일크기조회(objectKey: string): Promise<number> {
    const fullPath = this.clientProvider.validateAndCreatePath(objectKey);
    
    try {
      const stats = await fs.stat(fullPath);
      return stats.size;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException(`파일을 찾을 수 없습니다: ${objectKey}`);
      }
      throw new InternalServerErrorException(`파일 정보 조회 실패: ${error.message}`);
    }
  }

  async 폴더내부항목조회(folderPath: string): Promise<string[]> {
    const fullPath = this.clientProvider.validateAndCreatePath(folderPath);
    
    try {
      const entries = await fs.readdir(fullPath);
      return entries;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException(`디렉토리를 찾을 수 없습니다: ${folderPath}`);
      }
      throw new InternalServerErrorException(`목록 조회 실패: ${error.message}`);
    }
  }

  // ============================================
  // 추가 유틸리티 메서드 (nas-file.handler.ts 호환)
  // ============================================

  /**
   * 파일 존재 여부 확인
   */
  async exists(key: string): Promise<boolean> {
    try {
      const fullPath = this.clientProvider.validateAndCreatePath(key);
      await fs.access(fullPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 파일 정보 조회
   */
  async getInfo(key: string): Promise<FileInfoResult> {
    const fullPath = this.clientProvider.validateAndCreatePath(key);

    try {
      const stats = await fs.stat(fullPath);
      const ext = path.extname(key).toLowerCase();

      return {
        contentType: this.getMimeType(ext),
        contentLength: stats.size,
        createdAt: stats.birthtime,
        lastModified: stats.mtime,
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException(`파일을 찾을 수 없습니다: ${key}`);
      }
      throw new InternalServerErrorException(`정보 조회 실패: ${error.message}`);
    }
  }

  /**
   * 파일 크기 조회 (에러 처리 포함)
   */
  async getFileSize(key: string): Promise<number> {
    const fullPath = this.clientProvider.validateAndCreatePath(key);

    try {
      const stats = await fs.stat(fullPath);
      return stats.size;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException(`파일을 찾을 수 없습니다: ${key}`);
      }
      throw new InternalServerErrorException(`파일 정보 조회 실패: ${error.message}`);
    }
  }

  /**
   * 파일 스트리밍 다운로드 (메모리 효율적 - 전체 파일을 메모리에 로드하지 않음)
   */
  async downloadStream(key: string): Promise<FileDownloadResult> {
    const fullPath = this.clientProvider.validateAndCreatePath(key);

    try {
      const stats = await fs.stat(fullPath);
      
      // fs.createReadStream으로 진짜 스트리밍 (메모리에 전체 로드 안함)
      const stream = fsSync.createReadStream(fullPath, {
        highWaterMark: 64 * 1024, // 64KB 청크
      });

      const ext = path.extname(key).toLowerCase();

      return {
        stream,
        contentType: this.getMimeType(ext),
        contentLength: stats.size,
        filename: path.basename(key),
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException(`파일을 찾을 수 없습니다: ${key}`);
      }
      throw new InternalServerErrorException(`파일 읽기 실패: ${error.message}`);
    }
  }

  /**
   * 파일 Range 읽기 (멀티파트 병렬 전송용)
   * @param key 파일 키
   * @param start 시작 바이트 위치
   * @param end 끝 바이트 위치 (포함)
   */
  async downloadRange(key: string, start: number, end: number): Promise<Buffer> {
    const fullPath = this.clientProvider.validateAndCreatePath(key);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = fsSync.createReadStream(fullPath, { start, end });
      
      stream.on('data', (chunk) => chunks.push(chunk as Buffer));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          reject(new NotFoundException(`파일을 찾을 수 없습니다: ${key}`));
        } else {
          reject(new InternalServerErrorException(`파일 읽기 실패: ${error.message}`));
        }
      });
    });
  }

  /**
   * 파일 해시 계산 (SHA-256)
   */
  async calculateHash(key: string): Promise<string> {
    const fullPath = this.clientProvider.validateAndCreatePath(key);

    try {
      const content = await fs.readFile(fullPath);
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException(`파일을 찾을 수 없습니다: ${key}`);
      }
      throw new InternalServerErrorException(`해시 계산 실패: ${error.message}`);
    }
  }

  /**
   * 파일 스트림 쓰기 (대용량 파일용)
   * @param key 파일 키
   * @param options 스트림 옵션 (highWaterMark 등)
   */
  getWriteStream(key: string, options?: { highWaterMark?: number }): fsSync.WriteStream {
    const fullPath = this.clientProvider.validateAndCreatePath(key);

    // 부모 디렉토리 생성
    const parentDir = path.dirname(fullPath);
    if (!fsSync.existsSync(parentDir)) {
      fsSync.mkdirSync(parentDir, { recursive: true });
    }

    // 대용량 파일 최적화: 기본 highWaterMark = 4MB (기본값 64KB 대비 64배)
    const highWaterMark = options?.highWaterMark || 4 * 1024 * 1024;

    return fsSync.createWriteStream(fullPath, { highWaterMark });
  }

  /**
   * 파일 스트림 읽기 (대용량 파일용)
   */
  getReadStream(key: string, options?: { highWaterMark?: number }): fsSync.ReadStream {
    const fullPath = this.clientProvider.validateAndCreatePath(key);

    if (!fsSync.existsSync(fullPath)) {
      throw new NotFoundException(`파일을 찾을 수 없습니다: ${key}`);
    }

    const highWaterMark = options?.highWaterMark || 64 * 1024; // 64KB 기본값

    return fsSync.createReadStream(fullPath, { highWaterMark });
  }

  /**
   * 상대 경로 생성 (전체 경로에서)
   */
  createRelativePath(fullPath: string): string {
    return this.clientProvider.createRelativePath(fullPath);
  }

  /**
   * 파일 이름 변경
   */
  async rename(key: string, newName: string): Promise<string> {
    const sourceFullPath = this.clientProvider.validateAndCreatePath(key);

    try {
      await fs.access(sourceFullPath);
    } catch {
      throw new NotFoundException(`파일을 찾을 수 없습니다: ${key}`);
    }

    // 새 경로 생성 (같은 디렉토리 내에서 이름만 변경)
    const parentDir = path.dirname(key);
    const newKey = parentDir ? `${parentDir}/${newName}` : newName;
    const destFullPath = this.clientProvider.validateAndCreatePath(newKey);

    // 대상 파일이 이미 존재하는지 확인
    try {
      await fs.access(destFullPath);
      throw new InternalServerErrorException(`동일한 이름의 파일이 이미 존재합니다: ${newName}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT' && !(error instanceof InternalServerErrorException)) {
        throw error;
      }
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      // ENOENT는 파일이 없다는 뜻이므로 정상 진행
    }

    try {
      await fs.rename(sourceFullPath, destFullPath);
      this.logger.log(`✏️ Renamed: ${key} → ${newKey}`);
      return newKey;
    } catch (error: any) {
      throw new InternalServerErrorException(`이름 변경 실패: ${error.message}`);
    }
  }
}
