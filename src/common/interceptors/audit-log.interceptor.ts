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
import { ClientType, UserType } from '../../domain/audit/enums/common.enum';

/**
 * 사용자 정보 인터페이스 (JWT 페이로드에서 추출)
 */
interface UserPayload {
  sub?: string;  // JWT 표준 subject 클레임
  id?: string;   // 커스텀 id 필드 (auth.controller에서 사용)
  email?: string;
  name?: string;
  type?: 'INTERNAL' | 'EXTERNAL';
}

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
          await this.logFailure(request, error, auditOptions, durationMs);
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

    const context = RequestContext.get();
    const user = this.extractUser(request);
    const userId = this.extractUserId(user);

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

    await this.auditLogService.logSuccess({
      requestId: context?.requestId || 'unknown',
      sessionId: context?.sessionId || 'unknown',
      traceId: context?.traceId || 'unknown',
      userId,
      userType: this.mapUserType(user?.type),
      userName: user?.name || 'unknown',
      userEmail: user?.email || 'unknown',
      action,
      targetType,
      targetId,
      targetName,
      ipAddress: context?.ipAddress || 'unknown',
      userAgent: context?.userAgent || 'unknown',
      clientType: this.mapClientType(context?.userAgent),
      durationMs,
      metadata: extractMetadata
        ? extractMetadata(request, responseData)
        : undefined,
    });
  }

  /**
   * 실패 로그 기록
   */
  private async logFailure(
    request: Request,
    error: Error,
    options: AuditActionOptions,
    durationMs: number,
  ): Promise<void> {
    const { action, targetType, targetIdParam } = options;

    const context = RequestContext.get();
    const user = this.extractUser(request);
    const userId = this.extractUserId(user);

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

    await this.auditLogService.logFailure({
      requestId: context?.requestId || 'unknown',
      sessionId: context?.sessionId,
      traceId: context?.traceId,
      userId,
      userType: this.mapUserType(user?.type),
      userName: user?.name,
      userEmail: user?.email,
      action,
      targetType,
      targetId,
      ipAddress: context?.ipAddress || 'unknown',
      userAgent: context?.userAgent || 'unknown',
      clientType: this.mapClientType(context?.userAgent),
      durationMs,
      failReason: error.message || 'Unknown error',
      resultCode: (error as any).status?.toString() || 'ERROR',
    });
  }

  /**
   * 요청에서 사용자 정보 추출
   */
  private extractUser(request: Request): UserPayload | null {
    return (request as any).user || null;
  }

  /**
   * 사용자 ID 추출 (sub 또는 id 필드)
   */
  private extractUserId(user: UserPayload | null): string | undefined {
    return user?.sub || user?.id;
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
   * 사용자 타입 매핑
   */
  private mapUserType(type?: string): UserType {
    if (type === UserType.EXTERNAL) {
      return UserType.EXTERNAL;
    }
    return UserType.INTERNAL;
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
}
