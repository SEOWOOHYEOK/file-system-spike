/**
 * 휴지통 복원 관련 DTO
 * 설계 문서: 060-1.휴지통_처리_FLOW.md
 */

import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 복원 경로 상태
 */
export enum RestorePathStatus {
  /** 경로 존재 (복구 가능) */
  AVAILABLE = 'AVAILABLE',
  /** 경로 없음 (경로 지정 필요) */
  NOT_FOUND = 'NOT_FOUND',
}

/**
 * 복원 미리보기 요청 DTO
 * POST /trash/restore/preview
 */
export class RestorePreviewRequest {
  /** 특정 파일 ID 목록 (체크박스 선택) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trashMetadataIds?: string[];
}

/**
 * 복원 미리보기 응답 항목
 */
export interface RestorePreviewItem {
  trashMetadataId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  deletedAt: Date;
  
  // 경로 상태 (★ 경로명 기준)
  pathStatus: RestorePathStatus;
  originalPath: string;               // "/projects/2024/reports/" (삭제 시점의 경로명)
  originalFolderId: string;           // 삭제 시점의 폴더 ID (참고용)
  resolveFolderId: string | null;     // ★ 경로명으로 찾은 현재 폴더 ID (AVAILABLE이면 값 있음)
  
  // 충돌 여부
  hasConflict: boolean;               // 동일 파일 존재 여부
  conflictFileId?: string;            // 충돌 파일 ID (hasConflict=true일 때)
}

/**
 * 복원 미리보기 응답 DTO
 */
export interface RestorePreviewResponse {
  totalCount: number;
  items: RestorePreviewItem[];
  
  // 요약
  summary: {
    available: number;    // 경로 있는 파일 수 (복구 가능)
    notFound: number;     // 경로 없는 파일 수 (경로 선택 필요)
    conflict: number;     // 충돌 파일 수
  };
}

/**
 * 복원 실행 요청 항목
 */
export class RestoreExecuteItem {
  @IsString()
  trashMetadataId: string;

  /** 
   * 복구 경로 지정 (선택사항)
   * - 미지정: preview에서 받은 resolveFolderId로 자동 복구 (pathStatus=AVAILABLE인 경우)
   * - 지정: 해당 폴더로 복구 (pathStatus=NOT_FOUND인 경우 필수)
   */
  @IsOptional()
  @IsString()
  targetFolderId?: string;

  /**
   * 복구 제외 (선택사항)
   * - true: 이 파일은 복구하지 않음
   */
  @IsOptional()
  @IsBoolean()
  exclude?: boolean;
}

/**
 * 복원 실행 요청 DTO
 * POST /trash/restore/execute
 */
export class RestoreExecuteRequest {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RestoreExecuteItem)
  items: RestoreExecuteItem[];
}

/**
 * 복원 실행 응답 DTO
 */
export interface RestoreExecuteResponse {
  message: string;
  
  // 결과 통계
  queued: number;           // Bull Queue에 추가된 job 수
  excluded: number;         // 사용자가 제외한 항목 수
  skipped: number;          // 충돌로 skip된 항목 수
  
  // 생성된 sync_event ID 목록 (진행 상황 추적용)
  syncEventIds: string[];
  
  // skip된 항목 상세
  skippedItems: {
    trashMetadataId: string;
    fileName: string;
    reason: 'CONFLICT' | 'PATH_NOT_FOUND';
    conflictFileId?: string;
  }[];
}

/**
 * 복원 상태 조회 응답 DTO
 * GET /trash/restore/status
 */
export interface RestoreStatusResponse {
  // 전체 요약
  summary: {
    total: number;
    pending: number;      // 대기중
    processing: number;   // 처리중
    done: number;         // 완료
    failed: number;       // 실패
  };
  
  // 전체 완료 여부
  isCompleted: boolean;   // pending=0 && processing=0
  
  // 개별 항목 상태
  items: {
    syncEventId: string;
    fileId: string;
    fileName: string;
    status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
    errorMessage?: string;
    createdAt: Date;
    processedAt?: Date;
  }[];
}
