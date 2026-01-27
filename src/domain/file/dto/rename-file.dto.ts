/**
 * 파일명 변경 관련 DTO
 */

import { ConflictStrategy } from './upload-file.dto';
import { IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * 파일명 변경 요청 DTO
 */
export class RenameFileRequest {
  /** 새 파일명 */
  @IsString({ message: '파일명은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '새 파일명은 비어 있을 수 없습니다.' })
  newName: string;

  /** 충돌 전략 (기본값: ERROR) */
  @IsOptional()
  conflictStrategy?: ConflictStrategy;
}

/**
 * 파일명 변경 응답 DTO
 *
 * 문서: docs/000.FLOW/파일/005-1.파일_처리_FLOW.md
 * 응답: 200 OK (id, name, path, syncEventId)
 */
export interface RenameFileResponse {
  id: string;
  name: string;
  path: string;
  storageStatus: {
    nas: 'SYNCING';
  };
  updatedAt: string;
  /** sync_events 테이블 INSERT 후 반환된 ID */
  syncEventId: string;
}
