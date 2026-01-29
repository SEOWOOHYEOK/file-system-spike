/**
 * 파트 업로드 DTO
 */

/**
 * 파트 업로드 요청 (URL 파라미터 + Body)
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
