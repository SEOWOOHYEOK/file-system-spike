/**
 * 파트 업로드 DTO
 */

import type { Readable } from 'stream';

/**
 * 파트 업로드 요청 (URL 파라미터 + Body) - Buffer 방식 (하위 호환)
 */
export interface UploadPartRequest {
  /** 세션 ID */
  sessionId: string;

  /** 파트 번호 (1부터 시작) */
  partNumber: number;

  /** 파트 데이터 (Binary) */
  data: Buffer;
}

/**
 * 파트 업로드 요청 - Stream 방식 (메모리 효율적)
 *
 * Controller에서 req 스트림을 직접 전달하여
 * 10MB 파트 전체를 Buffer로 수집하지 않고 스트리밍 처리합니다.
 * 메모리 사용량: 10MB → ~128KB (highWaterMark 수준)
 */
export interface UploadPartStreamRequest {
  /** 세션 ID */
  sessionId: string;

  /** 파트 번호 (1부터 시작) */
  partNumber: number;

  /** 파트 데이터 스트림 (req body) */
  stream: Readable;
}

/**
 * 파트 업로드 응답
 */
export interface UploadPartResponse {
  /** 파트 번호 */
  partNumber: number;

  /** ETag */
  etag: string;

  /** 파트 크기 (bytes) */
  size: number;

  /** 세션 전체 진행률 (0-100) */
  sessionProgress: number;
}
