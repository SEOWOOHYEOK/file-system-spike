/**
 * SeaweedFS 캐시 어댑터
 * ICacheStoragePort의 SeaweedFS 구현체
 *
 * SeaweedFS는 분산 파일 시스템으로, 대용량 파일 저장에 적합합니다.
 * https://github.com/seaweedfs/seaweedfs
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import type { ICacheStoragePort } from '../../../../domain/storage/ports/cache-storage.port';

/**
 * SeaweedFS 할당 응답
 */
interface AssignResponse {
  fid: string;
  url: string;
  publicUrl: string;
  count: number;
}

/**
 * SeaweedFS 조회 응답
 */
interface LookupResponse {
  volumeOrFileId: string;
  locations: Array<{
    url: string;
    publicUrl: string;
  }>;
}

@Injectable()
export class SeaweedFSCacheAdapter implements ICacheStoragePort {
  private readonly logger = new Logger(SeaweedFSCacheAdapter.name);
  private readonly masterUrl: string;
  private readonly filerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.masterUrl = this.configService.get<string>('SEAWEEDFS_MASTER_URL', 'http://localhost:9333');
    this.filerUrl = this.configService.get<string>('SEAWEEDFS_FILER_URL', 'http://localhost:8888');
    this.logger.log(`SeaweedFSCacheAdapter initialized - Master: ${this.masterUrl}, Filer: ${this.filerUrl}`);
  }

  /**
   * Filer API를 통한 파일 경로 생성
   */
  private getFilerPath(objectKey: string): string {
    return `${this.filerUrl}/${objectKey}`;
  }

  async 파일쓰기(objectKey: string, data: Buffer): Promise<void> {
    const url = this.getFilerPath(objectKey);

    const response = await fetch(url, {
      method: 'POST',
      body: data.toString('base64') as BodyInit,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });

    if (!response.ok) {
      throw new Error(`SeaweedFS write failed: ${response.status} ${response.statusText}`);
    }

    this.logger.debug(`File written to SeaweedFS: ${objectKey}`);
  }

  async 파일스트림쓰기(objectKey: string, stream: Readable): Promise<void> {
    // Stream을 Buffer로 변환 후 저장
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    await this.파일쓰기(objectKey, buffer);
  }

  async 파일읽기(objectKey: string): Promise<Buffer> {
    const url = this.getFilerPath(objectKey);

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found in SeaweedFS: ${objectKey}`);
      }
      throw new Error(`SeaweedFS read failed: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async 파일스트림읽기(objectKey: string): Promise<Readable> {
    const url = this.getFilerPath(objectKey);

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found in SeaweedFS: ${objectKey}`);
      }
      throw new Error(`SeaweedFS read failed: ${response.status} ${response.statusText}`);
    }

    // Web ReadableStream을 Node.js Readable로 변환
    const webStream = response.body;
    if (!webStream) {
      throw new Error('Response body is null');
    }

    return Readable.fromWeb(webStream as any);
  }

  async 파일삭제(objectKey: string): Promise<void> {
    const url = this.getFilerPath(objectKey);

    const response = await fetch(url, {
      method: 'DELETE',
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`SeaweedFS delete failed: ${response.status} ${response.statusText}`);
    }

    this.logger.debug(`File deleted from SeaweedFS: ${objectKey}`);
  }

  async 파일존재확인(objectKey: string): Promise<boolean> {
    const url = this.getFilerPath(objectKey);

    try {
      const response = await fetch(url, {
        method: 'HEAD',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async 파일이동(oldKey: string, newKey: string): Promise<void> {
    // SeaweedFS Filer는 직접 이동을 지원하지 않으므로 복사 후 삭제
    const data = await this.파일읽기(oldKey);
    await this.파일쓰기(newKey, data);
    await this.파일삭제(oldKey);

    this.logger.debug(`File moved in SeaweedFS: ${oldKey} -> ${newKey}`);
  }

  async 파일크기조회(objectKey: string): Promise<number> {
    const url = this.getFilerPath(objectKey);

    const response = await fetch(url, {
      method: 'HEAD',
    });

    if (!response.ok) {
      throw new Error(`SeaweedFS getSize failed: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('Content-Length');
    return contentLength ? parseInt(contentLength, 10) : 0;
  }
}
