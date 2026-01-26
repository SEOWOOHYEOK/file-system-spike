/**
 * 폴더 생성 관련 DTO
 */

import { IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * 폴더 충돌 전략
 */
export enum FolderConflictStrategy {
  ERROR = 'ERROR',
  RENAME = 'RENAME',
}

/**
 * 폴더 생성 요청 DTO
 */
export class CreateFolderRequest {
  /** 폴더 이름 */
  @IsString({ message: '폴더명은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '폴더명은 필수입니다.' })
  name: string;

  /** 상위 폴더 ID (null = 루트) */
  @ValidateIf((o) => o.parentId !== null)
  @IsString({ message: '상위 폴더 ID는 문자열이어야 합니다.' })
  parentId: string | null;

  /** 충돌 전략 (기본값: ERROR) */
  @IsOptional()
  @IsEnum(FolderConflictStrategy, { message: '충돌 전략이 올바르지 않습니다. 허용 값: ERROR, RENAME' })
  conflictStrategy?: FolderConflictStrategy;
}

/**
 * 폴더 생성 응답 DTO
 */
export interface CreateFolderResponse {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  storageStatus: {
    nas: 'SYNCING';
  };
  createdAt: string;
}
