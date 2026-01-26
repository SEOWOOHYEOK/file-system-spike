/**
 * 폴더명 변경 관련 DTO
 */

import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { FolderConflictStrategy } from './create-folder.dto';

/**
 * 폴더명 변경 요청 DTO
 */
export class RenameFolderRequest {
  /** 새 폴더명 */
  @IsString({ message: '폴더명은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '폴더명은 필수입니다.' })
  newName: string;

  /** 충돌 전략 (기본값: ERROR) */
  @IsOptional()
  @IsEnum(FolderConflictStrategy, { message: '충돌 전략이 올바르지 않습니다. 허용 값: ERROR, RENAME' })
  conflictStrategy?: FolderConflictStrategy;
}

/**
 * 폴더명 변경 응답 DTO
 */
export class RenameFolderResponse {
  id: string;
  name: string;
  path: string;
  storageStatus: {
    nas: 'SYNCING';
  };
  updatedAt: string;
}
