/**
 * 파일 업로드 관련 DTO
 */

/**
 * 파일 업로드 요청 DTO
 */
export interface UploadFileRequest {
  /** 업로드할 파일 */
  file: Express.Multer.File;
  /** 대상 폴더 ID */
  folderId: string;
}

/**
 * 다중 파일 업로드 요청 DTO
 */
export interface UploadFilesRequest {
  /** 업로드할 파일 목록 */
  files: Express.Multer.File[];
  /** 대상 폴더 ID */
  folderId: string;
}

/**
 * 파일 업로드 응답 DTO
 *
 * 문서: docs/000.FLOW/파일/005-1.파일_처리_FLOW.md
 * 응답: 200 OK (fileId, name, path, syncEventId)
 */
export interface UploadFileResponse {
  id: string;
  name: string;
  folderId: string;
  path: string;
  size: number;
  mimeType: string;
  storageStatus: {
    cache: 'AVAILABLE';
    nas: 'SYNCING';
  };
  /** 파일 생성자 (업로더) ID - 감사 로그 ownerId 매핑용 */
  createdBy: string;
  /** 파일 체크섬 (SHA-256) - 업로드 후 무결성 검증용 */
  checksum: string;
  createdAt: string;
  /** sync_events 테이블 INSERT 후 반환된 ID */
  syncEventId: string;
}
