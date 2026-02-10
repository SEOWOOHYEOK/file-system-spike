import { HttpException } from '@nestjs/common';
import { ErrorCodeDefinition } from './error-codes';

/**
 * 비즈니스 예외 클래스
 *
 * 도메인별 에러 코드와 컨텍스트 정보를 포함하는 커스텀 예외입니다.
 * HttpException을 확장하여 NestJS의 예외 처리 시스템과 통합됩니다.
 */
export class BusinessException extends HttpException {
  /** 에러 코드 (숫자) */
  readonly errorCode: number;

  /** 내부 에러 코드 (문자열 식별자) */
  readonly internalCode: string;

  /** 디버깅용 컨텍스트 정보 (로그에만 기록, 응답에는 포함되지 않음) */
  readonly context?: Record<string, unknown>;

  /**
   * BusinessException 생성자
   *
   * @param errorDef - 에러 코드 정의
   * @param context - 선택적 컨텍스트 정보 (디버깅용)
   * @param messageOverride - 기본 메시지를 대체할 동적 메시지 (선택)
   */
  constructor(
    errorDef: ErrorCodeDefinition,
    context?: Record<string, unknown>,
    messageOverride?: string,
  ) {
    const message = messageOverride || errorDef.defaultMessage;
    super(
      {
        errorCode: errorDef.code,
        internalCode: errorDef.internalCode,
        message,
      },
      errorDef.httpStatus,
    );

    this.errorCode = errorDef.code;
    this.internalCode = errorDef.internalCode;
    this.context = context;
  }

  /**
   * BusinessException 인스턴스 생성
   *
   * @param errorDef - 에러 코드 정의
   * @param context - 선택적 컨텍스트 정보 (디버깅용)
   * @param messageOverride - 기본 메시지를 대체할 동적 메시지 (선택)
   * @returns BusinessException 인스턴스
   */
  static of(
    errorDef: ErrorCodeDefinition,
    context?: Record<string, unknown>,
    messageOverride?: string,
  ): BusinessException {
    return new BusinessException(errorDef, context, messageOverride);
  }

  /**
   * BusinessException을 생성하고 즉시 throw
   *
   * @param errorDef - 에러 코드 정의
   * @param context - 선택적 컨텍스트 정보 (디버깅용)
   * @param messageOverride - 기본 메시지를 대체할 동적 메시지 (선택)
   * @throws BusinessException
   */
  static throw(
    errorDef: ErrorCodeDefinition,
    context?: Record<string, unknown>,
    messageOverride?: string,
  ): never {
    throw new BusinessException(errorDef, context, messageOverride);
  }
}
