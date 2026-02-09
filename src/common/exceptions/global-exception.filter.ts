import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Inject,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import type { LoggerService } from '@nestjs/common';
import { Response } from 'express';
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

      // Log for debugging
      this.logger.warn(
        `Legacy HttpException: ${exception.message}`,
        exception.stack,
        'GlobalExceptionFilter',
      );

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
        `Unhandled exception: errorCode=${errorCode}`,
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
