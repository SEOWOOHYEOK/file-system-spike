/**
 * 폴더명 변경 관련 DTO
 */

import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 폴더명 변경 요청 DTO
 */
export class RenameFolderRequest {
  /** 새 폴더명 */
  @IsString({ message: '폴더명은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '폴더명은 필수입니다.' })
  newName: string;
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
