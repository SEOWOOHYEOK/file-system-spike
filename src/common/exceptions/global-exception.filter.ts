import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Inject,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import type { LoggerService } from '@nestjs/common';
import { Request, Response } from 'express';
import { BusinessException } from './business.exception';
import { ErrorMessageService } from '../error-message/error-message.service';
import { ErrorCodes } from './error-codes';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly errorMessageService: ErrorMessageService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestInfo = `${request.method} ${request.url}`;

    if (exception instanceof BusinessException) {
      // --- New format: BusinessException ---
      const errorCode = exception.errorCode;
      const internalCode = exception.internalCode;
      const httpStatus = exception.getStatus();

      // Get message from DB (might be customized by admin)
      const message = await this.errorMessageService.getMessage(errorCode);
      
      // Build user-facing response: message + [code]
      const userMessage = `${message} [${errorCode}]`;

      // Log full details for operators
      this.logger.error(
        `errorCode=${errorCode} internalCode=${internalCode} context=${JSON.stringify(exception.context || {})}`,
        exception.stack,
        'GlobalExceptionFilter',
      );

      response.status(httpStatus).json({
        statusCode: httpStatus,
        errorCode,
        message: userMessage,
        timestamp: new Date().toISOString(),
      });

    } else if (exception instanceof HttpException) {
      // --- Legacy format: NestJS HttpException (backward compatible) ---
      const httpStatus = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // ValidationPipe 등에서 발생한 상세 유효성 검증 에러 로깅
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        const validationErrors = resp.message;

        if (Array.isArray(validationErrors)) {
          // ValidationPipe 에러: 각 필드별 실패 사유를 상세 로깅
          this.logger.warn(
            `[${requestInfo}] ValidationPipe 유효성 검증 실패 [${httpStatus}]: ` +
            `${validationErrors.length}개 에러 → ${JSON.stringify(validationErrors)}` +
            ` | query: ${JSON.stringify(request.query)}` +
            ` | body: ${JSON.stringify(request.body)}` +
            ` | params: ${JSON.stringify(request.params)}`,
            exception.stack,
            'GlobalExceptionFilter',
          );
        } else {
          this.logger.warn(
            `[${requestInfo}] 기존 HttpException [${httpStatus}]: ${exception.message} → 응답: ${JSON.stringify(exceptionResponse)}`,
            exception.stack,
            'GlobalExceptionFilter',
          );
        }
      } else {
        this.logger.warn(
          `[${requestInfo}] 기존 HttpException [${httpStatus}]: ${exception.message}`,
          exception.stack,
          'GlobalExceptionFilter',
        );
      }

      // Pass-through the existing response format
      if (typeof exceptionResponse === 'string') {
        response.status(httpStatus).json({
          statusCode: httpStatus,
          message: exceptionResponse,
          timestamp: new Date().toISOString(),
        });
      } else {
        response.status(httpStatus).json({
          ...(exceptionResponse as object),
          timestamp: new Date().toISOString(),
        });
      }

    } else {
      // --- Unknown error → 9999 ---
      const errorCode = ErrorCodes.UNKNOWN_ERROR.code;
      const message = await this.errorMessageService.getMessage(errorCode);
      const userMessage = `${message} [${errorCode}]`;

      // Log full error for operators
      this.logger.error(
        `처리되지 않은 예외: errorCode=${errorCode}`,
        exception instanceof Error ? exception.stack : String(exception),
        'GlobalExceptionFilter',
      );

      response.status(500).json({
        statusCode: 500,
        errorCode,
        message: userMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
