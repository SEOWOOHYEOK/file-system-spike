import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap, catchError } from 'rxjs';
import { Request, Response } from 'express';
import {
  AUDIT_ACTION_KEY,
  AuditActionOptions,
} from '../decorators/audit-action.decorator';
import { AuditLogService } from '../../business/audit/audit-log.service';
import { RequestContext } from '../context/request-context';
import { detectClientType } from '../utils/device-fingerprint.util';
import { ClientType, UserType, LogResult } from '../../domain/audit/enums/common.enum';
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
  ) { }

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
          await this.logSuccess(
            request,
            response,
            responseData,
            auditOptions,
            durationMs,
          );
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
    const { action, targetType, targetIdParam, targetNameParam, extractMetadata } =
      options;

    const ctx = RequestContext.get();
    const userId = ctx?.userId;
    const userType = ctx?.userType as UserType ?? UserType.INTERNAL;
    const userName = ctx?.userName || 'unknown';
    const userEmail = ctx?.userEmail || 'unknown';

    // 인증되지 않은 사용자는 감사 로그 스킵 (userId가 UUID 타입이므로)
    if (!userId) {
      this.logger.debug('Skipping audit log for unauthenticated request');
      return;
    }

    const targetId = this.extractTargetId(request, responseData, targetIdParam);

    // targetId가 없거나 유효한 UUID가 아니면 감사 로그 스킵
    if (!this.isValidUuid(targetId)) {
      this.logger.warn(`Skipping audit log: invalid targetId "${targetId}" for action ${action}`);
      return;
    }

    const targetName = this.extractTargetName(
      request,
      responseData,
      targetNameParam,
    );

    // Extract new observability fields
    const httpMethod = request.method;
    const apiEndpoint = this.extractApiEndpoint(request);
    const responseStatusCode = response.statusCode;

    // Generate description using EventDescriptionBuilder
    let description: string;
    try {
      description = EventDescriptionBuilder.forAuditLog({
        action,
        actorName: userName,
        actorDepartment: undefined, // Department not available in current context
        actorType: userType,
        targetName: targetName,
        result: LogResult.SUCCESS,
        metadata: extractMetadata
          ? extractMetadata(request, responseData)
          : undefined,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to generate description for action ${action}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fallback description
      description = `${userName}가 ${action} 수행`;
    }

    await this.auditLogService.logSuccess({
      requestId: ctx?.requestId || 'unknown',
      sessionId: ctx?.sessionId || 'unknown',
      traceId: ctx?.traceId || 'unknown',
      userId,
      userType,
      userName,
      userEmail,
      action,
      targetType,
      targetId,
      targetName,
      ipAddress: ctx?.ipAddress || 'unknown',
      userAgent: ctx?.userAgent || 'unknown',
      clientType: this.mapClientType(ctx?.userAgent),
      durationMs,
      metadata: extractMetadata
        ? extractMetadata(request, responseData)
        : undefined,
      httpMethod,
      apiEndpoint,
      responseStatusCode,
      description,
    });
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
    const { action, targetType, targetIdParam } = options;

    const ctx = RequestContext.get();
    const userId = ctx?.userId;
    const userType = ctx?.userType as UserType ?? UserType.INTERNAL;
    const userName = ctx?.userName || 'unknown';
    const userEmail = ctx?.userEmail;

    // 인증되지 않은 사용자는 감사 로그 스킵 (userId가 UUID 타입이므로)
    if (!userId) {
      this.logger.debug('Skipping audit log for unauthenticated request');
      return;
    }

    const targetId = this.extractTargetId(request, null, targetIdParam);

    // targetId가 없거나 유효한 UUID가 아니면 감사 로그 스킵
    if (!this.isValidUuid(targetId)) {
      this.logger.warn(`Skipping audit log: invalid targetId "${targetId}" for action ${action}`);
      return;
    }

    // Extract new observability fields
    const httpMethod = request.method;
    const apiEndpoint = this.extractApiEndpoint(request);
    // Get status code from error if it's an HttpException, otherwise from response
    const responseStatusCode =
      (error as any).status || response.statusCode || 500;
    // Extract error code - check multiple possible properties
    const errorCode = 
      (error as any).code || 
      (error as any).errorCode || 
      (error as any).status?.toString() || 
      'ERROR';
    const failReason = error.message || 'Unknown error';
    
    // Resolve systemAction from errorCode
    const systemAction = resolveSystemAction(errorCode);

    // Generate description using EventDescriptionBuilder
    let description: string;
    try {
      description = EventDescriptionBuilder.forAuditLog({
        action,
        actorName: userName,
        actorDepartment: undefined, // Department not available in current context
        actorType: userType,
        targetName: undefined, // Target name may not be available in failure case
        result: LogResult.FAIL,
        failReason,
        errorCode,
      });
    } catch (descError) {
      this.logger.warn(
        `Failed to generate description for action ${action}: ${descError instanceof Error ? descError.message : String(descError)}`,
      );
      // Fallback description
      description = `${userName}가 ${action} 수행 실패: ${failReason}`;
    }

    await this.auditLogService.logFailure({
      requestId: ctx?.requestId || 'unknown',
      sessionId: ctx?.sessionId,
      traceId: ctx?.traceId,
      userId,
      userType,
      userName,
      userEmail,
      action,
      targetType,
      targetId,
      ipAddress: ctx?.ipAddress || 'unknown',
      userAgent: ctx?.userAgent || 'unknown',
      clientType: this.mapClientType(ctx?.userAgent),
      durationMs,
      failReason,
      resultCode: errorCode,
      errorCode,
      httpMethod,
      apiEndpoint,
      responseStatusCode,
      systemAction,
      description,
    });
  }

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
    if (request.body && request.body[paramName]) {
      return String(request.body[paramName]);
    }

    // 응답 데이터에서 찾기
    if (responseData && responseData[paramName]) {
      return String(responseData[paramName]);
    }

    // 응답 데이터의 id 필드 확인
    if (responseData && responseData.id) {
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
      // 기본 필드 확인
      if (responseData?.name) {
        return String(responseData.name);
      }
      if (responseData?.fileName) {
        return String(responseData.fileName);
      }
      if (responseData?.folderName) {
        return String(responseData.folderName);
      }
      return undefined;
    }

    if (request.body && request.body[paramName]) {
      return String(request.body[paramName]);
    }

    if (responseData && responseData[paramName]) {
      return String(responseData[paramName]);
    }

    return undefined;
  }

  /**
   * 클라이언트 타입 매핑
   */
  private mapClientType(userAgent?: string): ClientType {
    if (!userAgent) {
      return ClientType.UNKNOWN;
    }
    const detected = detectClientType(userAgent);
    switch (detected) {
      case 'web':
        return ClientType.WEB;
      case 'mobile':
        return ClientType.MOBILE;
      case 'api':
        return ClientType.API;
      default:
        return ClientType.UNKNOWN;
    }
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
      const urlWithoutQuery = request.url.split('?')[0];
      return urlWithoutQuery;
    }

    return undefined;
  }
}
