import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../domain/audit/enums/common.enum';

/**
 * 감사 로그 메타데이터 키
 */
export const AUDIT_ACTION_KEY = 'audit_action';

/**
 * 감사 액션 옵션
 */
export interface AuditActionOptions {
  /**
   * 감사 행위 타입
   */
  action: AuditAction;

  /**
   * 대상 타입
   */
  targetType: TargetType;

  /**
   * 대상 ID 파라미터 이름 (request params/body에서 추출)
   * 예: 'fileId', 'folderId', 'id'
   */
  targetIdParam?: string;

  /**
   * 대상 이름 파라미터 이름
   */
  targetNameParam?: string;

  /**
   * 추가 메타데이터 추출 함수
   */
  extractMetadata?: (request: any, response: any) => Record<string, unknown>;

  /**
   * 로그 기록 스킵 조건
   */
  skipIf?: (request: any, response: any) => boolean;
}

/**
 * @AuditAction 데코레이터
 *
 * 컨트롤러 메서드에 적용하여 자동으로 감사 로그 기록
 *
 * @example
 * ```typescript
 * @Get(':id')
 * @AuditAction({
 *   action: AuditAction.FILE_VIEW,
 *   targetType: TargetType.FILE,
 *   targetIdParam: 'id',
 * })
 * async getFile(@Param('id') id: string) { ... }
 * ```
 */
export const AuditActionDecorator = (options: AuditActionOptions) =>
  SetMetadata(AUDIT_ACTION_KEY, options);

/**
 * 타입스크립트 데코레이터 별칭
 */
export { AuditActionDecorator as AuditAction };
