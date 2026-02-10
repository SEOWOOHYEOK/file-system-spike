import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { AuditAction } from '../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../domain/audit/enums/common.enum';

/**
 * 감사 로그 메타데이터 키
 */
export const AUDIT_ACTION_KEY = 'audit_action';

/**
 * 감사 액션 옵션
 *
 * @description 컨트롤러 메서드에 `@AuditAction(options)` 형태로 적용하여
 * AuditLogInterceptor가 자동으로 감사 로그를 기록하도록 설정
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
   * 대상 ID 파라미터 이름 (request params/query/body 또는 response에서 추출)
   * 예: 'fileId', 'folderId', 'id'
   */
  targetIdParam?: string;

  /**
   * 대상 이름 파라미터 이름
   */
  targetNameParam?: string;

  /**
   * 추가 메타데이터 추출 함수
   *
   * request(Express Request)와 response(컨트롤러 반환값)에서
   * 감사 로그에 기록할 추가 정보를 추출하는 순수 함수
   *
   * @param request - Express Request 객체 (params, query, body, headers, file 등)
   * @param response - 컨트롤러 메서드의 반환값 (@Res() 사용 시 undefined)
   * @returns 메타데이터 객체 (AuditLogMetadata로 저장됨)
   *
   * @example
   * ```typescript
   * extractMetadata: (req, res) => ({
   *   fileSize: res?.size,
   *   mimeType: res?.mimeType,
   *   folderId: req.body?.folderId,
   * })
   * ```
   */
  extractMetadata?: (request: Request, response: any) => Record<string, unknown>;

  /**
   * 로그 기록 스킵 조건
   *
   * @param request - Express Request 객체
   * @param response - 컨트롤러 메서드의 반환값
   * @returns true이면 감사 로그를 기록하지 않음
   */
  skipIf?: (request: Request, response: any) => boolean;

  /**
   * 배열 응답을 항목별 개별 감사 로그로 기록
   *
   * true이면 응답이 배열일 때 각 항목에 대해 개별 감사 로그를 생성한다.
   * 예: uploadMany → file1 로그, file2 로그, ... (파일별 row)
   *
   * perItem 모드에서는:
   * - extractItemMetadata: 각 항목에 대한 메타데이터 추출 (필수)
   * - targetIdParam, targetNameParam: 각 항목에서 추출
   */
  perItem?: boolean;

  /**
   * 배열 항목별 메타데이터 추출 함수 (perItem: true일 때 사용)
   *
   * 개별 항목(단일 객체)에서 메타데이터를 추출한다.
   * extractMetadata와 시그니처가 동일하지만, response가 배열이 아닌 단일 항목이다.
   *
   * @example
   * ```typescript
   * // extractUploadMetadata는 단일 UploadFileResponse를 받으므로 그대로 재사용 가능
   * extractItemMetadata: extractUploadMetadata,
   * ```
   */
  extractItemMetadata?: (request: Request, item: any) => Record<string, unknown>;
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
