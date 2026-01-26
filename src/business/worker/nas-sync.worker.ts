import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import * as path from 'path';
import {
  JOB_QUEUE_PORT,
  Job,
} from '../../domain/queue/ports/job-queue.port';
import {
  CACHE_STORAGE_PORT,
} from '../../domain/storage/ports/cache-storage.port';
import {
  NAS_STORAGE_PORT,
} from '../../domain/storage/ports/nas-storage.port';
import {
  FILE_REPOSITORY,
  FILE_STORAGE_OBJECT_REPOSITORY,
  StorageType,
  AvailabilityStatus,
} from '../../domain/file';

import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';
import type { ICacheStoragePort } from '../../domain/storage/ports/cache-storage.port';
import type { INasStoragePort } from '../../domain/storage/ports/nas-storage.port';
import type { IFileRepository, IFileStorageObjectRepository } from '../../domain/file';

@Injectable()
export class NasSyncWorker implements OnModuleInit {
  private readonly logger = new Logger(NasSyncWorker.name);

  constructor(
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
    @Inject(CACHE_STORAGE_PORT)
    private readonly cacheStorage: ICacheStoragePort,
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    @Inject(FILE_REPOSITORY)
    private readonly fileRepository: IFileRepository,
    @Inject(FILE_STORAGE_OBJECT_REPOSITORY)
    private readonly fileStorageObjectRepository: IFileStorageObjectRepository,
  ) { }

  async onModuleInit() {
    this.logger.log('Registering NAS_SYNC_UPLOAD job processor...');
    await this.jobQueue.processJobs('NAS_SYNC_UPLOAD', this.processUploadJob.bind(this));
  }

  /**
   * NAS 동기화 작업 처리
   */
  private async processUploadJob(job: Job<{ fileId: string }>): Promise<void> {
    const { fileId } = job.data;
    this.logger.debug(`Processing NAS sync for file: ${fileId}`);

    try {
      // 1. NAS 스토리지 객체 조회
      const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.NAS,
      );

      if (!nasObject) {
        this.logger.warn(`NAS storage object not found for file: ${fileId}`);
        return;
      }

      //
      if (nasObject.isAvailable()) {
        this.logger.debug(`File already synced to NAS: ${fileId}`);
        return;
      }

      // 2. 파일 정보 조회 (확장자 추출용)
      const file = await this.fileRepository.findById(fileId);
      if (!file) {
        this.logger.warn(`File not found: ${fileId}`);
        return;
      }

      // 3. 캐시에서 파일 읽기 (스트림)
      const readStream = await this.cacheStorage.파일스트림읽기(fileId);

      // 4. NAS에 파일 쓰기 (스트림)
      // objectKey는 fileId + 확장자 형태로 생성 (파일명에서 확장자 추출)
      const extension = path.extname(file.name); // 예: ".txt", ".pdf"
      const objectKey = extension ? `${file.name}` : fileId;
      await this.nasStorage.파일스트림쓰기(objectKey, readStream);

      // 5. 상태 업데이트
      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(objectKey);
      await this.fileStorageObjectRepository.save(nasObject);

      this.logger.log(`Successfully synced file to NAS: ${fileId} -> ${objectKey}`);
    } catch (error) {
      this.logger.error(`Failed to sync file to NAS: ${fileId}`, error);

      // 실패 시 상태 업데이트 (선택 사항: 재시도 로직은 큐 어댑터에서 처리됨)
      // 심각한 오류인 경우 ERROR 상태로 변경할 수도 있음
      throw error; // 큐 시스템이 재시도하도록 에러 전파
    }
  }
}
