/**
 * 폴더 생성 관련 DTO
 */

import { IsNotEmpty, IsString, ValidateIf } from 'class-validator';

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
