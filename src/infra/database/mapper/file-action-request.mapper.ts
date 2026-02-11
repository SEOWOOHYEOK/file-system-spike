import { FileActionRequest } from '../../../domain/file-action-request/entities/file-action-request.entity';
import { FileActionRequestOrmEntity } from '../entities/file-action-request.orm-entity';

export class FileActionRequestMapper {
  static toDomain(orm: FileActionRequestOrmEntity): FileActionRequest {
    return new FileActionRequest({
      id: orm.id,
      type: orm.type as any,
      status: orm.status as any,
      fileId: orm.fileId,
      fileName: orm.fileName,
      sourceFolderId: orm.sourceFolderId ?? undefined,
      targetFolderId: orm.targetFolderId ?? undefined,
      requesterId: orm.requesterId,
      designatedApproverId: orm.designatedApproverId,
      approverId: orm.approverId ?? undefined,
      reason: orm.reason,
      decisionComment: orm.decisionComment ?? undefined,
      snapshotFolderId: orm.snapshotFolderId,
      snapshotFileState: orm.snapshotFileState,
      executionNote: orm.executionNote ?? undefined,
      requestedAt: orm.requestedAt,
      decidedAt: orm.decidedAt ?? undefined,
      executedAt: orm.executedAt ?? undefined,
      updatedAt: orm.updatedAt ?? undefined,
    });
  }

  static toOrm(domain: FileActionRequest): FileActionRequestOrmEntity {
    const orm = new FileActionRequestOrmEntity();
    orm.id = domain.id;
    orm.type = domain.type;
    orm.status = domain.status;
    orm.fileId = domain.fileId;
    orm.fileName = domain.fileName;
    orm.sourceFolderId = domain.sourceFolderId ?? null;
    orm.targetFolderId = domain.targetFolderId ?? null;
    orm.requesterId = domain.requesterId;
    orm.designatedApproverId = domain.designatedApproverId;
    orm.approverId = domain.approverId ?? null;
    orm.reason = domain.reason;
    orm.decisionComment = domain.decisionComment ?? null;
    orm.snapshotFolderId = domain.snapshotFolderId;
    orm.snapshotFileState = domain.snapshotFileState;
    orm.executionNote = domain.executionNote ?? null;
    orm.requestedAt = domain.requestedAt;
    orm.decidedAt = domain.decidedAt ?? null;
    orm.executedAt = domain.executedAt ?? null;
    orm.updatedAt = domain.updatedAt ?? null;
    return orm;
  }
}
