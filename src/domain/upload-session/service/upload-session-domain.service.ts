/**
 * 업로드 세션 도메인 서비스
 * UploadSessionEntity와 UploadPartEntity의 행위를 실행하고 영속성을 보장합니다.
 *
 * DDD 관점: 도메인 서비스는 엔티티 행위 호출 후 Repository를 통해 변경사항을 영속화합니다.
 */

import { Inject, Injectable } from '@nestjs/common';
import { UploadSessionEntity } from '../entities/upload-session.entity';
import { UploadPartEntity } from '../entities/upload-part.entity';
import { UploadSessionStatus } from '../type/upload-session.type';
import {
  UPLOAD_SESSION_REPOSITORY,
  UPLOAD_PART_REPOSITORY,
} from '../repositories/upload-session.repository.interface';
import type {
  IUploadSessionRepository,
  IUploadPartRepository,
  TransactionOptions,
  FindSessionOptions,
} from '../repositories/upload-session.repository.interface';

/**
 * 세션 생성 파라미터
 */
export interface CreateSessionParams {
  id: string;
  fileName: string;
  folderId: string;
  totalSize: number;
  mimeType: string;
  partSize?: number;
  uploadId?: string;
  conflictStrategy?: string;
}

/**
 * 파트 생성 파라미터
 */
export interface CreatePartParams {
  id: string;
  sessionId: string;
  partNumber: number;
  size: number;
  objectKey?: string;
}

@Injectable()
export class UploadSessionDomainService {
  constructor(
    @Inject(UPLOAD_SESSION_REPOSITORY)
    private readonly sessionRepository: IUploadSessionRepository,
    @Inject(UPLOAD_PART_REPOSITORY)
    private readonly partRepository: IUploadPartRepository,
  ) {}

  // ============================================
  // 세션 조회 메서드 (Session Query Methods)
  // ============================================

  /**
   * ID로 세션 조회
   */
  async 세션조회(sessionId: string, txOptions?: TransactionOptions): Promise<UploadSessionEntity | null> {
    return this.sessionRepository.findById(sessionId, txOptions);
  }

  /**
   * ID로 세션 조회 (락 획득)
   */
  async 세션잠금조회(sessionId: string, txOptions?: TransactionOptions): Promise<UploadSessionEntity | null> {
    return this.sessionRepository.findByIdForUpdate(sessionId, txOptions);
  }

  /**
   * 조건으로 세션 목록 조회
   */
  async 세션목록조회(options: FindSessionOptions, txOptions?: TransactionOptions): Promise<UploadSessionEntity[]> {
    return this.sessionRepository.findMany(options, txOptions);
  }

  /**
   * 만료된 세션 목록 조회
   */
  async 만료세션조회(limit?: number, txOptions?: TransactionOptions): Promise<UploadSessionEntity[]> {
    return this.sessionRepository.findExpiredSessions(limit, txOptions);
  }

  // ============================================
  // 세션 명령 메서드 (Session Command Methods)
  // ============================================

  /**
   * 세션 생성
   * 새 업로드 세션을 생성하고 영속화합니다.
   *
   * @param params - 세션 생성 파라미터
   * @param txOptions - 트랜잭션 옵션
   * @returns 생성된 세션 엔티티
   */
  async 세션생성(params: CreateSessionParams, txOptions?: TransactionOptions): Promise<UploadSessionEntity> {
    const session = UploadSessionEntity.create({
      id: params.id,
      fileName: params.fileName,
      folderId: params.folderId,
      totalSize: params.totalSize,
      mimeType: params.mimeType,
      partSize: params.partSize,
      uploadId: params.uploadId,
      conflictStrategy: params.conflictStrategy,
    });

    return this.sessionRepository.save(session, txOptions);
  }

  /**
   * 세션 저장
   * 기존 세션을 업데이트합니다.
   *
   * @param session - 저장할 세션 엔티티
   * @param txOptions - 트랜잭션 옵션
   * @returns 저장된 세션 엔티티
   */
  async 세션저장(session: UploadSessionEntity, txOptions?: TransactionOptions): Promise<UploadSessionEntity> {
    return this.sessionRepository.save(session, txOptions);
  }

  /**
   * 세션 완료 처리
   * 엔티티의 complete 행위를 실행하고 영속화합니다.
   *
   * @param sessionId - 세션 ID
   * @param fileId - 생성된 파일 ID
   * @param txOptions - 트랜잭션 옵션
   * @returns 업데이트된 세션 엔티티
   */
  async 세션완료(sessionId: string, fileId: string, txOptions?: TransactionOptions): Promise<UploadSessionEntity> {
    const session = await this.sessionRepository.findByIdForUpdate(sessionId, txOptions);
    if (!session) {
      throw new Error(`세션을 찾을 수 없습니다: ${sessionId}`);
    }

    return this.엔티티세션완료(session, fileId, txOptions);
  }

  /**
   * 세션 완료 처리 (엔티티 직접 전달)
   */
  async 엔티티세션완료(
    session: UploadSessionEntity,
    fileId: string,
    txOptions?: TransactionOptions,
  ): Promise<UploadSessionEntity> {
    session.complete(fileId);
    return this.sessionRepository.save(session, txOptions);
  }

  /**
   * 세션 병합 중 처리 (비동기 complete 진입)
   * 파트 업로드 완료 → NAS sync + 캐시 concat 진행 상태로 전환
   *
   * @param session - 세션 엔티티
   * @param fileId - 생성된 파일 ID
   * @param txOptions - 트랜잭션 옵션
   * @returns 업데이트된 세션 엔티티
   */
  async 엔티티세션병합중(
    session: UploadSessionEntity,
    fileId: string,
    txOptions?: TransactionOptions,
  ): Promise<UploadSessionEntity> {
    session.completing(fileId);
    return this.sessionRepository.save(session, txOptions);
  }

  /**
   * 세션 취소 처리
   * 엔티티의 abort 행위를 실행하고 영속화합니다.
   *
   * @param sessionId - 세션 ID
   * @param txOptions - 트랜잭션 옵션
   * @returns 업데이트된 세션 엔티티
   */
  async 세션취소(sessionId: string, txOptions?: TransactionOptions): Promise<UploadSessionEntity> {
    const session = await this.sessionRepository.findByIdForUpdate(sessionId, txOptions);
    if (!session) {
      throw new Error(`세션을 찾을 수 없습니다: ${sessionId}`);
    }

    return this.엔티티세션취소(session, txOptions);
  }

  /**
   * 세션 취소 처리 (엔티티 직접 전달)
   */
  async 엔티티세션취소(session: UploadSessionEntity, txOptions?: TransactionOptions): Promise<UploadSessionEntity> {
    session.abort();
    return this.sessionRepository.save(session, txOptions);
  }

  /**
   * 세션 만료 처리
   * 엔티티의 expire 행위를 실행하고 영속화합니다.
   *
   * @param sessionId - 세션 ID
   * @param txOptions - 트랜잭션 옵션
   * @returns 업데이트된 세션 엔티티
   */
  async 세션만료(sessionId: string, txOptions?: TransactionOptions): Promise<UploadSessionEntity> {
    const session = await this.sessionRepository.findByIdForUpdate(sessionId, txOptions);
    if (!session) {
      throw new Error(`세션을 찾을 수 없습니다: ${sessionId}`);
    }

    return this.엔티티세션만료(session, txOptions);
  }

  /**
   * 세션 만료 처리 (엔티티 직접 전달)
   */
  async 엔티티세션만료(session: UploadSessionEntity, txOptions?: TransactionOptions): Promise<UploadSessionEntity> {
    session.expire();
    return this.sessionRepository.save(session, txOptions);
  }

  /**
   * 세션 삭제
   *
   * @param sessionId - 세션 ID
   * @param txOptions - 트랜잭션 옵션
   */
  async 세션삭제(sessionId: string, txOptions?: TransactionOptions): Promise<void> {
    return this.sessionRepository.delete(sessionId, txOptions);
  }

  /**
   * 만료된 세션 일괄 삭제
   *
   * @param txOptions - 트랜잭션 옵션
   * @returns 삭제된 세션 수
   */
  async 만료세션일괄삭제(txOptions?: TransactionOptions): Promise<number> {
    return this.sessionRepository.deleteExpiredSessions(txOptions);
  }

  /**
   * 전체 활성 세션 통계 조회
   * (INIT | UPLOADING 상태, 미만료)
   */
  async 활성세션통계(): Promise<{ count: number; totalBytes: number }> {
    return this.sessionRepository.getActiveSessionStats();
  }

  // ============================================
  // 파트 조회 메서드 (Part Query Methods)
  // ============================================

  /**
   * ID로 파트 조회
   */
  async 파트조회(partId: string, txOptions?: TransactionOptions): Promise<UploadPartEntity | null> {
    return this.partRepository.findById(partId, txOptions);
  }

  /**
   * 세션 ID와 파트 번호로 파트 조회
   */
  async 파트번호조회(
    sessionId: string,
    partNumber: number,
    txOptions?: TransactionOptions,
  ): Promise<UploadPartEntity | null> {
    return this.partRepository.findBySessionIdAndPartNumber(sessionId, partNumber, txOptions);
  }

  /**
   * 세션 ID로 모든 파트 조회
   */
  async 세션파트목록조회(sessionId: string, txOptions?: TransactionOptions): Promise<UploadPartEntity[]> {
    return this.partRepository.findBySessionId(sessionId, txOptions);
  }

  /**
   * 세션 ID로 완료된 파트만 조회
   */
  async 완료파트목록조회(sessionId: string, txOptions?: TransactionOptions): Promise<UploadPartEntity[]> {
    return this.partRepository.findCompletedBySessionId(sessionId, txOptions);
  }

  // ============================================
  // 파트 명령 메서드 (Part Command Methods)
  // ============================================

  /**
   * 파트 생성
   * 새 업로드 파트를 생성하고 영속화합니다.
   *
   * @param params - 파트 생성 파라미터
   * @param txOptions - 트랜잭션 옵션
   * @returns 생성된 파트 엔티티
   */
  async 파트생성(params: CreatePartParams, txOptions?: TransactionOptions): Promise<UploadPartEntity> {
    const part = UploadPartEntity.create({
      id: params.id,
      sessionId: params.sessionId,
      partNumber: params.partNumber,
      size: params.size,
      objectKey: params.objectKey,
    });

    return this.partRepository.save(part, txOptions);
  }

  /**
   * 파트 저장
   * 기존 파트를 업데이트합니다.
   *
   * @param part - 저장할 파트 엔티티
   * @param txOptions - 트랜잭션 옵션
   * @returns 저장된 파트 엔티티
   */
  async 파트저장(part: UploadPartEntity, txOptions?: TransactionOptions): Promise<UploadPartEntity> {
    return this.partRepository.save(part, txOptions);
  }

  /**
   * 파트 완료 처리
   * 엔티티의 complete 행위를 실행하고 영속화합니다.
   *
   * @param partId - 파트 ID
   * @param etag - ETag
   * @param objectKey - 스토리지 objectKey
   * @param txOptions - 트랜잭션 옵션
   * @returns 업데이트된 파트 엔티티
   */
  async 파트완료(
    partId: string,
    etag: string,
    objectKey: string,
    txOptions?: TransactionOptions,
  ): Promise<UploadPartEntity> {
    const part = await this.partRepository.findById(partId, txOptions);
    if (!part) {
      throw new Error(`파트를 찾을 수 없습니다: ${partId}`);
    }

    return this.엔티티파트완료(part, etag, objectKey, txOptions);
  }

  /**
   * 파트 완료 처리 (엔티티 직접 전달)
   */
  async 엔티티파트완료(
    part: UploadPartEntity,
    etag: string,
    objectKey: string,
    txOptions?: TransactionOptions,
  ): Promise<UploadPartEntity> {
    part.complete(etag, objectKey);
    return this.partRepository.save(part, txOptions);
  }

  /**
   * 파트 삭제
   *
   * @param partId - 파트 ID
   * @param txOptions - 트랜잭션 옵션
   */
  async 파트삭제(partId: string, txOptions?: TransactionOptions): Promise<void> {
    return this.partRepository.delete(partId, txOptions);
  }

  /**
   * 세션의 모든 파트 삭제
   *
   * @param sessionId - 세션 ID
   * @param txOptions - 트랜잭션 옵션
   */
  async 세션파트일괄삭제(sessionId: string, txOptions?: TransactionOptions): Promise<void> {
    return this.partRepository.deleteBySessionId(sessionId, txOptions);
  }

  // ============================================
  // 복합 작업 메서드 (Combined Operations)
  // ============================================

  /**
   * 파트 업로드 완료 및 세션 업데이트
   * 파트를 완료 처리하고 세션의 진행상황을 업데이트합니다.
   *
   * @param session - 세션 엔티티
   * @param part - 파트 엔티티
   * @param etag - ETag
   * @param objectKey - 스토리지 objectKey
   * @param partSize - 파트 크기
   * @param txOptions - 트랜잭션 옵션
   * @returns 업데이트된 세션과 파트
   */
  async 파트업로드완료(
    session: UploadSessionEntity,
    part: UploadPartEntity,
    etag: string,
    objectKey: string,
    partSize: number,
    txOptions?: TransactionOptions,
  ): Promise<{ session: UploadSessionEntity; part: UploadPartEntity }> {
    // 파트 완료 처리
    part.complete(etag, objectKey);
    const savedPart = await this.partRepository.save(part, txOptions);

    // 세션 진행상황 업데이트
    session.markPartCompleted(part.partNumber, partSize);
    const savedSession = await this.sessionRepository.save(session, txOptions);

    return { session: savedSession, part: savedPart };
  }
}
