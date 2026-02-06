/**
 * 세션 상태 조회 DTO
 */

/**
 * 세션 상태 조회 응답
 */
export interface SessionStatusResponse {
  /** 세션 ID */
  sessionId: string;

  /** 파일명 */
  fileName: string;

  /** 세션 상태 */
  status: 'INIT' | 'UPLOADING' | 'COMPLETING' | 'COMPLETED' | 'ABORTED' | 'EXPIRED';

  /** 파일 전체 크기 (bytes) */
  totalSize: number;

  /** 업로드된 바이트 수 */
  uploadedBytes: number;

  /** 진행률 (0-100) */
  progress: number;

  /** 총 파트 수 */
  totalParts: number;

  /** 완료된 파트 번호 목록 */
  completedParts: number[];

  /** 다음 업로드할 파트 번호 (없으면 null) */
  nextPartNumber: number | null;

  /** 남은 바이트 수 */
  remainingBytes: number;

  /** 세션 만료 시간 (ISO 8601) */
  expiresAt: string;

  /** 생성된 파일 ID (완료 시) */
  fileId?: string;
}

/**
 * 취소 응답
 */
export interface AbortSessionResponse {
  /** 세션 ID */
  sessionId: string;

  /** 상태 */
  status: 'ABORTED';

  /** 메시지 */
  message: string;
}
