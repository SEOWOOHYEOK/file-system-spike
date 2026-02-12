/**
 * 멀티파트 업로드 초기화 DTO
 */

/**
 * 멀티파트 업로드 초기화 요청
 */
export interface InitiateMultipartRequest {
  /** 파일명 */
  fileName: string;

  /** 대상 폴더 ID */
  folderId: string;

  /** 파일 전체 크기 (bytes) */
  totalSize: number;

  /** MIME 타입 */
  mimeType: string;
}

/**
 * 멀티파트 업로드 초기화 응답
 */
export interface InitiateMultipartResponse {
  /** 세션 ID */
  sessionId: string;

  /** 캐시 스토리지 uploadId (있는 경우) */
  uploadId?: string;

  /** 파트 크기 (bytes) */
  partSize: number;

  /** 총 파트 수 */
  totalParts: number;

  /** 세션 만료 시간 (ISO 8601) */
  expiresAt: string;
}
