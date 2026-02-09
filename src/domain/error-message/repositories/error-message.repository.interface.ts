import { ErrorMessage } from '../entities/error-message.entity';

export const ERROR_MESSAGE_REPOSITORY = Symbol('ERROR_MESSAGE_REPOSITORY');

/**
 * ErrorMessage 리포지토리 인터페이스
 */
export interface IErrorMessageRepository {
  /**
   * 에러 코드로 조회
   *
   * @param errorCode - 에러 코드
   * @returns ErrorMessage 또는 null
   */
  findByCode(errorCode: number): Promise<ErrorMessage | null>;

  /**
   * 모든 에러 메시지 조회
   *
   * @returns ErrorMessage 배열
   */
  findAll(): Promise<ErrorMessage[]>;

  /**
   * 에러 메시지 저장
   *
   * @param errorMessage - 저장할 ErrorMessage
   * @returns 저장된 ErrorMessage
   */
  save(errorMessage: ErrorMessage): Promise<ErrorMessage>;

  /**
   * 에러 메시지 저장 또는 업데이트 (단일)
   *
   * @param errorMessage - 저장/업데이트할 ErrorMessage
   */
  upsert(errorMessage: ErrorMessage): Promise<void>;

  /**
   * 에러 메시지 저장 또는 업데이트 (일괄)
   *
   * @param errorMessages - 저장/업데이트할 ErrorMessage 배열
   */
  upsertMany(errorMessages: ErrorMessage[]): Promise<void>;
}
