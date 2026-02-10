import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap, catchError } from 'rxjs';
import { Request, Response } from 'express';
import {
  AUDIT_ACTION_KEY,
  AuditActionOptions,
} from '../decorators/audit-action.decorator';
import { AuditLogService } from '../../business/audit/audit-log.service';
import {
  RequestContext,
  AuditContextSnapshot,
} from '../context/request-context';
import { UserType, LogResult } from '../../domain/audit/enums/common.enum';
import { AuditAction } from '../../domain/audit/enums/audit-action.enum';
import { EventDescriptionBuilder } from '../../domain/audit/service/description-builder';
import { resolveSystemAction } from '../../domain/audit/service/system-action-resolver';

/**
 * AuditLogInterceptor
 *
 * @AuditAction 데코레이터가 적용된 컨트롤러 메서드에 대해
 * 자동으로 감사 로그 기록
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditOptions = this.reflector.get<AuditActionOptions>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    // @AuditAction 데코레이터가 없으면 로깅 스킵
    if (!auditOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    return next.handle().pipe(
      tap(async (responseData) => {
        try {
          // 스킵 조건 확인
          if (auditOptions.skipIf && auditOptions.skipIf(request, responseData)) {
            return;
          }

          const durationMs = Date.now() - startTime;

          // perItem 모드: 배열 응답의 각 항목에 대해 개별 감사 로그 생성
          if (auditOptions.perItem && Array.isArray(responseData)) {
            await this.logSuccessPerItem(request, response, responseData, auditOptions, durationMs);
          } else {
            await this.logSuccess(request, response, responseData, auditOptions, durationMs);
          }
        } catch (error) {
          this.logger.error('Failed to log audit success', error);
        }
      }),
      catchError(async (error) => {
        try {
          const durationMs = Date.now() - startTime;
          await this.logFailure(request, response, error, auditOptions, durationMs);
        } catch (logError) {
          this.logger.error('Failed to log audit failure', logError);
        }
        throw error;
      }),
    );
  }

  // ──────────────────────────────────────────────
  //  감사 로그 기록
  // ──────────────────────────────────────────────

  /**
   * 성공 로그 기록
   */
  private async logSuccess(
    request: Request,
    response: Response,
    responseData: any,
    options: AuditActionOptions,
    durationMs: number,
  ): Promise<void> {
    const snapshot = RequestContext.getAuditSnapshot();

    if (!this.isLoggable(snapshot, options.action)) {
      return;
    }

    const targetId = this.extractTargetId(request, responseData, options.targetIdParam);
    if (!this.isValidUuid(targetId)) {
      this.logger.warn(`Skipping audit log: invalid targetId "${targetId}" for action ${options.action}`);
      return;
    }

    const metadata = options.extractMetadata?.(request, responseData);
    const targetName =
      this.extractTargetName(request, responseData, options.targetNameParam)
      ?? (metadata?.targetName as string | undefined);

    // metadata에서 audit 1급 필드 추출
    const ownerId = (metadata?.createdBy as string) || undefined;
    const targetPath = (metadata?.path as string) || (metadata?.newPath as string) || undefined;
    const syncEventId = (metadata?.syncEventId as string) || undefined;

    const description = this.buildDescription({
      action: options.action,
      actorName: snapshot.userName,
      actorType: snapshot.userType,
      targetName,
      result: LogResult.SUCCESS,
      metadata,
    });

    await this.auditLogService.logSuccess({
      ...this.buildBaseLogParams(snapshot, options, request, response.statusCode),
      targetId,
      targetName,
      targetPath,
      ownerId,
      syncEventId,
      durationMs,
      metadata,
      description,
    });
  }

  /**
   * 배열 응답의 각 항목에 대해 개별 성공 로그 기록
   *
   * perItem: true일 때 호출. 각 항목마다 독립된 audit log row를 생성한다.
   * 예: uploadMany([file1, file2]) → audit_log 2건 (file1, file2 각각)
   */
  private async logSuccessPerItem(
    request: Request,
    response: Response,
    items: any[],
    options: AuditActionOptions,
    totalDurationMs: number,
  ): Promise<void> {
    const snapshot = RequestContext.getAuditSnapshot();

    if (!this.isLoggable(snapshot, options.action)) {
      return;
    }

    const baseParams = this.buildBaseLogParams(snapshot, options, request, response.statusCode);
    const perItemDurationMs = items.length > 0 ? Math.round(totalDurationMs / items.length) : totalDurationMs;

    for (const item of items) {
      try {
        const targetId = this.extractTargetId(request, item, options.targetIdParam);
        if (!this.isValidUuid(targetId)) {
          this.logger.warn(`Skipping per-item audit log: invalid targetId "${targetId}" for action ${options.action}`);
          continue;
        }

        // 항목별 메타데이터 추출 (extractItemMetadata 우선, fallback으로 extractMetadata)
        const metadata = options.extractItemMetadata
          ? options.extractItemMetadata(request, item)
          : options.extractMetadata?.(request, item);

        const targetName =
          this.extractTargetName(request, item, options.targetNameParam)
          ?? (metadata?.targetName as string | undefined);

        // metadata에서 audit 1급 필드 추출
        const ownerId = (metadata?.createdBy as string) || undefined;
        const targetPath = (metadata?.path as string) || (metadata?.newPath as string) || undefined;
        const syncEventId = (metadata?.syncEventId as string) || undefined;

        const description = this.buildDescription({
          action: options.action,
          actorName: snapshot.userName,
          actorType: snapshot.userType,
          targetName,
          result: LogResult.SUCCESS,
          metadata,
        });

        await this.auditLogService.logSuccess({
          ...baseParams,
          targetId,
          targetName,
          targetPath,
          ownerId,
          syncEventId,
          durationMs: perItemDurationMs,
          metadata,
          description,
        });
      } catch (itemError) {
        this.logger.error(`Failed to log per-item audit for item`, itemError);
      }
    }
  }

  /**
   * 실패 로그 기록
   */
  private async logFailure(
    request: Request,
    response: Response,
    error: Error,
    options: AuditActionOptions,
    durationMs: number,
  ): Promise<void> {
    const snapshot = RequestContext.getAuditSnapshot();

    if (!this.isLoggable(snapshot, options.action)) {
      return;
    }

    const targetId = this.extractTargetId(request, null, options.targetIdParam);
    if (!this.isValidUuid(targetId)) {
      this.logger.warn(`Skipping audit log: invalid targetId "${targetId}" for action ${options.action}`);
      return;
    }

    const { statusCode, errorCode, failReason } = this.extractErrorInfo(error, response);
    const systemAction = resolveSystemAction(errorCode);

    const description = this.buildDescription({
      action: options.action,
      actorName: snapshot.userName,
      actorType: snapshot.userType,
      result: LogResult.FAIL,
      failReason,
      errorCode,
    });

    await this.auditLogService.logFailure({
      ...this.buildBaseLogParams(snapshot, options, request, statusCode),
      targetId,
      durationMs,
      failReason,
      resultCode: errorCode,
      errorCode,
      systemAction,
      description,
    });
  }

  // ──────────────────────────────────────────────
  //  공통 헬퍼
  // ──────────────────────────────────────────────

  /**
   * 감사 로그 기록 가능 여부 확인
   *
   * userId가 없으면 (비인증 요청) 스킵한다.
   */
  private isLoggable(
    snapshot: AuditContextSnapshot,
    action: string,
  ): boolean {
    if (!snapshot.userId) {
      this.logger.debug(`Skipping audit log for unauthenticated request (action: ${action})`);
      return false;
    }
    return true;
  }

  /**
   * 성공/실패 공통 로그 파라미터 조립
   */
  private buildBaseLogParams(
    snapshot: AuditContextSnapshot,
    options: AuditActionOptions,
    request: Request,
    responseStatusCode: number,
  ) {
    return {
      requestId: snapshot.requestId,
      sessionId: snapshot.sessionId,
      traceId: snapshot.traceId,
      userId: snapshot.userId!,
      userType: snapshot.userType,
      userName: snapshot.userName,
      userEmail: snapshot.userEmail,
      action: options.action,
      targetType: options.targetType,
      ipAddress: snapshot.ipAddress,
      userAgent: snapshot.userAgent,
      clientType: snapshot.clientType,
      httpMethod: request.method,
      apiEndpoint: this.extractApiEndpoint(request),
      responseStatusCode,
    };
  }

  /**
   * 에러에서 상태코드·에러코드·사유를 추출
   */
  private extractErrorInfo(
    error: Error,
    response: Response,
  ): { statusCode: number; errorCode: string; failReason: string } {
    const isHttpException = error instanceof HttpException;

    const statusCode = isHttpException
      ? (error as HttpException).getStatus()
      : response.statusCode || 500;

    const err = error as unknown as Record<string, unknown>;
    const errorCode =
      (err.code as string)
      ?? (err.errorCode as string)
      ?? String(statusCode);

    const failReason = error.message || 'Unknown error';

    return { statusCode, errorCode, failReason };
  }

  /**
   * EventDescriptionBuilder를 사용한 설명 생성 (fallback 포함)
   */
  private buildDescription(params: {
    action: AuditAction;
    actorName: string;
    actorType?: UserType;
    targetName?: string;
    result: LogResult;
    metadata?: Record<string, unknown>;
    failReason?: string;
    errorCode?: string;
  }): string {
    try {
      return EventDescriptionBuilder.forAuditLog({
        action: params.action,
        actorName: params.actorName,
        actorDepartment: undefined,
        actorType: params.actorType,
        targetName: params.targetName,
        result: params.result,
        metadata: params.metadata,
        failReason: params.failReason,
        errorCode: params.errorCode,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to generate description for action ${params.action}: ${error instanceof Error ? error.message : String(error)}`,
      );
      const suffix = params.failReason ? ` 실패: ${params.failReason}` : '';
      return `${params.actorName}가 ${params.action} 수행${suffix}`;
    }
  }

  // ──────────────────────────────────────────────
  //  추출 유틸리티
  // ──────────────────────────────────────────────

  /**
   * 대상 ID 추출
   */
  private extractTargetId(
    request: Request,
    responseData: any,
    paramName?: string,
  ): string | undefined {
    if (!paramName) {
      return undefined;
    }

    // URL 파라미터에서 찾기
    const paramValue = request.params[paramName];
    if (paramValue) {
      return Array.isArray(paramValue) ? paramValue[0] : paramValue;
    }

    // 쿼리 파라미터에서 찾기
    const queryValue = request.query[paramName];
    if (queryValue) {
      return Array.isArray(queryValue) ? String(queryValue[0]) : String(queryValue);
    }

    // 요청 본문에서 찾기
    if (request.body?.[paramName]) {
      return String(request.body[paramName]);
    }

    // 응답 데이터에서 찾기
    if (responseData?.[paramName]) {
      return String(responseData[paramName]);
    }

    // 응답 데이터의 id 필드 확인
    if (responseData?.id) {
      return String(responseData.id);
    }

    return undefined;
  }

  /**
   * 대상 이름 추출
   */
  private extractTargetName(
    request: Request,
    responseData: any,
    paramName?: string,
  ): string | undefined {
    if (!paramName) {
      return (
        responseData?.name ??
        responseData?.fileName ??
        responseData?.folderName ??
        undefined
      );
    }

    return (
      request.body?.[paramName]
        ? String(request.body[paramName])
        : responseData?.[paramName]
          ? String(responseData[paramName])
          : undefined
    );
  }

  /**
   * UUID 유효성 검증 (타입 가드)
   */
  private isValidUuid(value: string | undefined): value is string {
    if (!value) {
      return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  /**
   * API 엔드포인트 추출
   *
   * @param request - Express Request 객체
   * @returns 정규화된 API 엔드포인트 경로 (예: '/v1/files/:id')
   */
  private extractApiEndpoint(request: Request): string | undefined {
    // NestJS route path (패턴 포함, 예: '/v1/files/:id')
    if (request.route?.path) {
      return request.route.path;
    }

    // Fallback: request.url에서 쿼리 스트링 제거
    if (request.url) {
      return request.url.split('?')[0];
    }

    return undefined;
  }
}
