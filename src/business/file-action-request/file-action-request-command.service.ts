import { Inject, Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { FileActionRequest } from '../../domain/file-action-request/entities/file-action-request.entity';
import { FileActionType } from '../../domain/file-action-request/enums/file-action-type.enum';
import { FileActionRequestStatus } from '../../domain/file-action-request/enums/file-action-request-status.enum';
import { FileActionRequestDomainService } from '../../domain/file-action-request/services/file-action-request-domain.service';
import { FileActionRequestValidationService } from './file-action-request-validation.service';
import { FileManageService } from '../file/file-manage.service';
import { FileDomainService } from '../../domain/file/service/file-domain.service';
import {
  FILE_ACTION_REQUEST_NOTIFICATION_PORT,
  type FileActionRequestNotificationPort,
} from '../../domain/file-action-request/ports/notification.port';
import { BusinessException, ErrorCodes } from '../../common/exceptions';

export interface CreateMoveRequestDto {
  fileId: string;
  targetFolderId: string;
  reason: string;
  designatedApproverId: string;
}

export interface CreateDeleteRequestDto {
  fileId: string;
  reason: string;
  designatedApproverId: string;
}

@Injectable()
export class FileActionRequestCommandService {
  private readonly logger = new Logger(FileActionRequestCommandService.name);

  constructor(
    private readonly domainService: FileActionRequestDomainService,
    private readonly validationService: FileActionRequestValidationService,
    private readonly fileManageService: FileManageService,
    private readonly fileDomainService: FileDomainService,
    @Inject(FILE_ACTION_REQUEST_NOTIFICATION_PORT)
    private readonly notificationPort: FileActionRequestNotificationPort,
  ) {}

  /** 이동 요청 생성 */
  async createMoveRequest(requesterId: string, dto: CreateMoveRequestDto): Promise<FileActionRequest> {
    const file = await this.validationService.validateFile(dto.fileId);
    await this.validationService.validateTargetFolder(dto.targetFolderId);
    await this.validationService.checkDuplicate(dto.fileId);
    await this.validationService.validateApprover(dto.designatedApproverId, FileActionType.MOVE);

    const request = new FileActionRequest({
      id: uuidv4(),
      type: FileActionType.MOVE,
      fileId: dto.fileId,
      fileName: file.name,
      sourceFolderId: file.folderId,
      targetFolderId: dto.targetFolderId,
      requesterId,
      designatedApproverId: dto.designatedApproverId,
      reason: dto.reason,
      snapshotFolderId: file.folderId,
      snapshotFileState: file.state,
    });

    const saved = await this.domainService.저장(request);

    await this.notificationPort.notifyNewRequest({
      requestId: saved.id,
      requesterId,
      approverId: dto.designatedApproverId,
      actionType: 'MOVE',
      fileName: file.name,
    });

    return saved;
  }

  /** 삭제 요청 생성 */
  async createDeleteRequest(requesterId: string, dto: CreateDeleteRequestDto): Promise<FileActionRequest> {
    const file = await this.validationService.validateFile(dto.fileId);
    await this.validationService.checkDuplicate(dto.fileId);
    await this.validationService.validateApprover(dto.designatedApproverId, FileActionType.DELETE);

    const request = new FileActionRequest({
      id: uuidv4(),
      type: FileActionType.DELETE,
      fileId: dto.fileId,
      fileName: file.name,
      sourceFolderId: file.folderId,
      requesterId,
      designatedApproverId: dto.designatedApproverId,
      reason: dto.reason,
      snapshotFolderId: file.folderId,
      snapshotFileState: file.state,
    });

    const saved = await this.domainService.저장(request);

    await this.notificationPort.notifyNewRequest({
      requestId: saved.id,
      requesterId,
      approverId: dto.designatedApproverId,
      actionType: 'DELETE',
      fileName: file.name,
    });

    return saved;
  }

  /** 요청 취소 */
  async cancelRequest(requestId: string, userId: string): Promise<FileActionRequest> {
    const request = await this.getOrThrow(requestId);

    if (request.requesterId !== userId) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_NOT_OWNER, { requestId, userId });
    }
    if (!request.isDecidable()) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_NOT_CANCELLABLE, {
        requestId, currentStatus: request.status,
      });
    }

    request.cancel();
    return await this.domainService.저장(request);
  }

  /**
   * 승인 (즉시 실행)
   *
   * 1. 요청 조회 + PENDING 확인
   * 2. approve()
   * 3. 낙관적 검증 (현재 파일 상태 vs 스냅샷)
   * 4. 실행 (FileManageService 위임)
   * 5. markExecuted / markFailed / INVALIDATED
   */
  async approveRequest(requestId: string, approverId: string, comment?: string): Promise<FileActionRequest> {
    const request = await this.getOrThrow(requestId);

    if (!request.isDecidable()) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_NOT_APPROVABLE, {
        requestId, currentStatus: request.status,
      });
    }

    request.approve(approverId, comment);

    // 낙관적 검증
    const file = await this.fileDomainService.조회(request.fileId);
    if (!file) {
      request.status = FileActionRequestStatus.INVALIDATED;
      request.executionNote = '파일이 삭제되었습니다.';
      request.updatedAt = new Date();
      const saved = await this.domainService.저장(request);

      await this.notificationPort.notifyDecision({
        requestId, requesterId: request.requesterId,
        actionType: request.type, decision: 'INVALIDATED',
        comment: request.executionNote,
      });
      return saved;
    }

    const isValid = request.validateStateForExecution(file.folderId, file.state);
    if (!isValid) {
      const saved = await this.domainService.저장(request);

      await this.notificationPort.notifyDecision({
        requestId, requesterId: request.requesterId,
        actionType: request.type, decision: 'INVALIDATED',
        comment: request.executionNote,
      });
      return saved;
    }

    // 실행
    try {
      if (request.type === FileActionType.MOVE) {
        await this.fileManageService.move(
          request.fileId,
          { targetFolderId: request.targetFolderId! },
          approverId,
        );
      } else {
        await this.fileManageService.delete(request.fileId, approverId);
      }
      request.markExecuted();
    } catch (error) {
      this.logger.error(`파일 작업 실행 실패: ${requestId}`, error);
      request.markFailed(error.message || '실행 중 오류 발생');
    }

    const saved = await this.domainService.저장(request);

    await this.notificationPort.notifyDecision({
      requestId, requesterId: request.requesterId,
      actionType: request.type,
      decision: request.status,
      comment,
    });

    return saved;
  }

  /** 반려 */
  async rejectRequest(requestId: string, approverId: string, comment: string): Promise<FileActionRequest> {
    const request = await this.getOrThrow(requestId);

    if (!request.isDecidable()) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_NOT_REJECTABLE, {
        requestId, currentStatus: request.status,
      });
    }

    request.reject(approverId, comment);
    const saved = await this.domainService.저장(request);

    await this.notificationPort.notifyDecision({
      requestId, requesterId: request.requesterId,
      actionType: request.type, decision: 'REJECTED', comment,
    });

    return saved;
  }

  /** 일괄 승인 */
  async bulkApprove(ids: string[], approverId: string, comment?: string): Promise<FileActionRequest[]> {
    const results: FileActionRequest[] = [];
    for (const id of ids) {
      const result = await this.approveRequest(id, approverId, comment);
      results.push(result);
    }
    return results;
  }

  /** 일괄 반려 */
  async bulkReject(ids: string[], approverId: string, comment: string): Promise<FileActionRequest[]> {
    const results: FileActionRequest[] = [];
    for (const id of ids) {
      const result = await this.rejectRequest(id, approverId, comment);
      results.push(result);
    }
    return results;
  }

  private async getOrThrow(requestId: string): Promise<FileActionRequest> {
    const request = await this.domainService.조회(requestId);
    if (!request) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_NOT_FOUND, { requestId });
    }
    return request;
  }
}
