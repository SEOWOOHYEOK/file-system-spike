/**
 * 폴더 이동 관련 DTO
 */

import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * 폴더 이동 충돌 전략
 */
export enum MoveFolderConflictStrategy {
  ERROR = 'ERROR',
  RENAME = 'RENAME',
  SKIP = 'SKIP',
}

/**
 * 폴더 이동 요청 DTO
 */
export class MoveFolderRequest {
  /** 대상 상위 폴더 ID */
  @IsString({ message: '대상 폴더 ID는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '대상 폴더 ID는 필수입니다.' })
  targetParentId: string;

  /** 충돌 전략 (기본값: ERROR) */
  @IsOptional()
  @IsEnum(MoveFolderConflictStrategy, { message: '충돌 전략이 올바르지 않습니다. 허용 값: ERROR, RENAME, SKIP' })
  conflictStrategy?: MoveFolderConflictStrategy;
}

/**
 * 폴더 이동 응답 DTO
 */
export class MoveFolderResponse {
  id: string;
  name: string;
  parentId: string;
  path: string;
  skipped?: boolean;
  reason?: string;
  storageStatus: {
    nas: 'SYNCING';
  };
  updatedAt: string;
}
