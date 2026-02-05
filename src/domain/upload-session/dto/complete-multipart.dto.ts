/**
 * 멀티파트 업로드 완료 DTO
 */

/**
 * 파트 정보 (완료 요청 시 전달)
 */
export interface PartInfo {
  /** 파트 번호 */
  partNumber: number;

  /** ETag */
  etag: string;
}

/**
 * 멀티파트 업로드 완료 요청
 */
export interface CompleteMultipartRequest {
  /** 세션 ID */
  sessionId: string;

  /** 완료된 파트 목록 (선택적, 검증용) */
  parts?: PartInfo[];

  /** 파일 생성자 ID */
  createdBy?: string;
}

/**
 * 멀티파트 업로드 완료 응답
 */
export interface CompleteMultipartResponse {
  /** 생성된 파일 ID */
  fileId: string;

  /** 파일명 */
  name: string;

  /** 폴더 ID */
  folderId: string;

  /** 파일 경로 */
  path: string;

  /** 파일 크기 (bytes) */
  size: number;

  /** MIME 타입 */
  mimeType: string;

  /** 스토리지 상태 */
  storageStatus: {
    cache: 'AVAILABLE';
    nas: 'SYNCING';
  };

  /** 생성 시간 (ISO 8601) */
  createdAt: string;

  /** 동기화 이벤트 ID */
  syncEventId: string;
}
