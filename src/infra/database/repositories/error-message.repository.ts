import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorMessage } from '../../../domain/error-message/entities/error-message.entity';
import { IErrorMessageRepository } from '../../../domain/error-message/repositories/error-message.repository.interface';
import { ErrorMessageOrmEntity } from '../entities/error-message.orm-entity';
import { ErrorMessageMapper } from '../mapper/error-message.mapper';

/**
 * ErrorMessage 리포지토리 구현
 */
@Injectable()
export class ErrorMessageRepository implements IErrorMessageRepository {
  constructor(
    @InjectRepository(ErrorMessageOrmEntity)
    private readonly repository: Repository<ErrorMessageOrmEntity>,
  ) {}

  async findByCode(errorCode: number): Promise<ErrorMessage | null> {
    const orm = await this.repository.findOne({
      where: { errorCode },
    });

    if (!orm) {
      return null;
    }

    return ErrorMessageMapper.toDomain(orm);
  }

  async findAll(): Promise<ErrorMessage[]> {
    const orms = await this.repository.find({
      order: { errorCode: 'ASC' },
    });

    return ErrorMessageMapper.toDomainList(orms);
  }

  async save(errorMessage: ErrorMessage): Promise<ErrorMessage> {
    const ormEntity = ErrorMessageMapper.toOrm(errorMessage);
    const saved = await this.repository.save(ormEntity);
    return ErrorMessageMapper.toDomain(saved);
  }

  async upsert(errorMessage: ErrorMessage): Promise<void> {
    const ormEntity = ErrorMessageMapper.toOrm(errorMessage);
    await this.repository.upsert(ormEntity, {
      conflictPaths: ['errorCode'],
    });
  }

  async upsertMany(errorMessages: ErrorMessage[]): Promise<void> {
    if (errorMessages.length === 0) {
      return;
    }

    const ormEntities = errorMessages.map((em) =>
      ErrorMessageMapper.toOrm(em),
    );
    await this.repository.upsert(ormEntities, {
      conflictPaths: ['errorCode'],
    });
  }
}
