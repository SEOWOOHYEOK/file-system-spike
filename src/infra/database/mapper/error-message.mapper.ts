import { ErrorMessage } from '../../../domain/error-message/entities/error-message.entity';
import { ErrorMessageOrmEntity } from '../entities/error-message.orm-entity';

/**
 * ErrorMessage 매퍼
 *
 * Domain Entity <-> ORM Entity 변환
 */
export class ErrorMessageMapper {
  /**
   * ORM Entity -> Domain Entity
   */
  static toDomain(orm: ErrorMessageOrmEntity): ErrorMessage {
    return ErrorMessage.reconstitute({
      errorCode: orm.errorCode,
      internalCode: orm.internalCode,
      httpStatus: orm.httpStatus,
      defaultMessage: orm.defaultMessage,
      customMessage: orm.customMessage,
      updatedAt: orm.updatedAt,
      updatedBy: orm.updatedBy,
    });
  }

  /**
   * Domain Entity -> ORM Entity
   */
  static toOrm(domain: ErrorMessage): ErrorMessageOrmEntity {
    return {
      errorCode: domain.errorCode,
      internalCode: domain.internalCode,
      httpStatus: domain.httpStatus,
      defaultMessage: domain.defaultMessage,
      customMessage: domain.customMessage,
      updatedAt: domain.updatedAt,
      updatedBy: domain.updatedBy,
    };
  }

  /**
   * ORM Entity 배열 -> Domain Entity 배열
   */
  static toDomainList(orms: ErrorMessageOrmEntity[]): ErrorMessage[] {
    return orms.map((orm) => this.toDomain(orm));
  }
}
