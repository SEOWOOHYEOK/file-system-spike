/**
 * 폴더 이동 관련 DTO
 */

import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 폴더 이동 요청 DTO
 */
export class MoveFolderRequest {
  /** 대상 상위 폴더 ID */
  @IsString({ message: '대상 폴더 ID는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '대상 폴더 ID는 필수입니다.' })
  targetParentId: string;
}

/**
 * 폴더 이동 응답 DTO
 */
export class MoveFolderResponse {
  id: string;
  name: string;
  parentId: string;
  path: string;
  storageStatus: {
    nas: 'SYNCING';
  };
  updatedAt: string;
}
