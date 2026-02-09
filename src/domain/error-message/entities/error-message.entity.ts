/**
 * ErrorMessage 생성 파라미터
 *
 * ErrorMessage.create() 팩토리 메서드에 전달되는 파라미터
 */
export interface CreateErrorMessageParams {
  errorCode: number;
  internalCode: string;
  httpStatus: number;
  defaultMessage: string;
  customMessage?: string | null;
  updatedAt?: Date;
  updatedBy?: string | null;
}

/**
 * ErrorMessage 도메인 엔티티
 *
 * 에러 코드와 메시지 매핑을 저장
 * - 운영자가 런타임에 메시지를 수정할 수 있음
 * - customMessage가 null이면 defaultMessage 사용
 *
 * 설계 원칙:
 * - 에러 코드별 기본 메시지와 커스텀 메시지 분리
 * - 메시지 변경 이력 추적 (updatedAt, updatedBy)
 * - effectiveMessage로 실제 사용할 메시지 반환
 */
export class ErrorMessage {
  readonly errorCode: number;
  readonly internalCode: string;
  readonly httpStatus: number;
  readonly defaultMessage: string;
  readonly customMessage: string | null;
  readonly updatedAt: Date;
  readonly updatedBy: string | null;

  private constructor(props: Partial<ErrorMessage> & { errorCode: number; internalCode: string; httpStatus: number; defaultMessage: string }) {
    Object.assign(this, props);
  }

  /**
   * ErrorMessage 생성 팩토리 메서드
   *
   * @param params - 에러 메시지 생성에 필요한 파라미터
   * @returns 새로운 ErrorMessage 인스턴스
   */
  static create(params: CreateErrorMessageParams): ErrorMessage {
    return new ErrorMessage({
      errorCode: params.errorCode,
      internalCode: params.internalCode,
      httpStatus: params.httpStatus,
      defaultMessage: params.defaultMessage,
      customMessage: params.customMessage ?? null,
      updatedAt: params.updatedAt ?? new Date(),
      updatedBy: params.updatedBy ?? null,
    });
  }

  /**
   * 재구성 (DB에서 로드 시)
   *
   * @param props - DB에서 조회한 데이터
   * @returns 재구성된 ErrorMessage 인스턴스
   */
  static reconstitute(
    props: Partial<ErrorMessage> & { errorCode: number; internalCode: string; httpStatus: number; defaultMessage: string },
  ): ErrorMessage {
    return new ErrorMessage(props);
  }

  /**
   * 실제 사용할 메시지 반환
   * customMessage가 설정되어 있으면 그것을, 없으면 defaultMessage를 반환
   *
   * @returns 실제 사용할 메시지
   */
  get effectiveMessage(): string {
    return this.customMessage ?? this.defaultMessage;
  }

  /**
   * 커스텀 메시지 업데이트
   *
   * @param message - 새로운 커스텀 메시지 (null이면 기본 메시지 사용)
   * @param adminId - 수정한 관리자 ID
   * @returns 업데이트된 ErrorMessage 인스턴스
   */
  updateCustomMessage(message: string | null, adminId: string): ErrorMessage {
    return new ErrorMessage({
      ...this,
      customMessage: message,
      updatedAt: new Date(),
      updatedBy: adminId,
    });
  }
}
