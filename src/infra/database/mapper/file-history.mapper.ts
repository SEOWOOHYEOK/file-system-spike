import { FileHistory, FileState } from '../../../domain/audit/entities/file-history.entity';
import { FileChangeType } from '../../../domain/audit/enums/file-change.enum';
import { UserType } from '../../../domain/audit/enums/common.enum';
import { FileHistoryOrmEntity } from '../entities/file-history.orm-entity';

/**
 * FileHistory 매퍼
 *
 * Domain Entity <-> ORM Entity 변환
 */
export class FileHistoryMapper {
  /**
   * ORM Entity -> Domain Entity
   */
  static toDomain(orm: FileHistoryOrmEntity): FileHistory {
    return FileHistory.reconstitute({
      id: orm.id,
      fileId: orm.fileId,
      version: orm.version,
      changeType: orm.changeType as FileChangeType,
      changedBy: orm.changedBy,
      userType: orm.userType as UserType,
      previousState: (orm.previousState as FileState) || undefined,
      newState: (orm.newState as FileState) || undefined,
      checksumBefore: orm.checksumBefore || undefined,
      checksumAfter: orm.checksumAfter || undefined,
      changeSummary: orm.changeSummary || undefined,
      createdAt: orm.createdAt,
    });
  }

  /**
   * Domain Entity -> ORM Entity
   */
  static toOrm(domain: FileHistory): Partial<FileHistoryOrmEntity> {
    return {
      id: domain.id,
      fileId: domain.fileId,
      version: domain.version,
      changeType: domain.changeType,
      changedBy: domain.changedBy,
      userType: domain.userType,
      previousState: domain.previousState || null,
      newState: domain.newState || null,
      checksumBefore: domain.checksumBefore || null,
      checksumAfter: domain.checksumAfter || null,
      changeSummary: domain.changeSummary || null,
      createdAt: domain.createdAt,
    };
  }

  /**
   * ORM Entity 배열 -> Domain Entity 배열
   */
  static toDomainList(orms: FileHistoryOrmEntity[]): FileHistory[] {
    return orms.map((orm) => this.toDomain(orm));
  }
}
