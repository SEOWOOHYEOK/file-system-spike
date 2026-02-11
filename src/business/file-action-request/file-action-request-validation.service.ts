import { Injectable } from '@nestjs/common';
import { FileActionRequestDomainService } from '../../domain/file-action-request/services/file-action-request-domain.service';
import { FileDomainService } from '../../domain/file/service/file-domain.service';
import { FolderDomainService } from '../../domain/folder/service/folder-domain.service';
import { UserService } from '../user/user.service';
import { PermissionEnum } from '../../domain/role/permission.enum';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import { FileActionType } from '../../domain/file-action-request/enums/file-action-type.enum';

@Injectable()
export class FileActionRequestValidationService {
  constructor(
    private readonly domainService: FileActionRequestDomainService,
    private readonly fileDomainService: FileDomainService,
    private readonly folderDomainService: FolderDomainService,
    private readonly userService: UserService,
  ) {}

  /** 파일 존재+활성 검증 */
  async validateFile(fileId: string) {
    const file = await this.fileDomainService.조회(fileId);
    if (!file || !file.isActive()) {
      throw BusinessException.of(ErrorCodes.FILE_NOT_FOUND, { fileId });
    }
    return file;
  }

  /** 대상 폴더 존재+활성 검증 (MOVE) */
  async validateTargetFolder(folderId: string) {
    const folder = await this.folderDomainService.조회(folderId);
    if (!folder || !folder.isActive()) {
      throw BusinessException.of(ErrorCodes.FOLDER_NOT_FOUND, { folderId });
    }
    return folder;
  }

  /** 중복 PENDING 요청 검사 */
  async checkDuplicate(fileId: string) {
    const existing = await this.domainService.파일PENDING조회(fileId);
    if (existing) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_DUPLICATE, {
        existingRequestId: existing.id,
        requesterId: existing.requesterId,
        type: existing.type,
        designatedApproverId: existing.designatedApproverId,
        fileName: existing.fileName,
        requestedAt: existing.requestedAt,
        ...(existing.targetFolderId ? { targetFolderId: existing.targetFolderId } : {}),
      });
    }
  }

  /** 지정 승인자가 해당 권한을 가지고 있는지 검증 */
  async validateApprover(approverId: string, actionType: FileActionType) {
    const { user, role } = await this.userService.findByIdWithRole(approverId);
    if (!user.isActive || !role) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_INVALID_APPROVER, { approverId });
    }
    const requiredPermission = actionType === FileActionType.MOVE
      ? PermissionEnum.FILE_MOVE_APPROVE
      : PermissionEnum.FILE_DELETE_APPROVE;
    const hasPermission = role.permissions.some((p) => p.code === requiredPermission);
    if (!hasPermission) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_INVALID_APPROVER, {
        approverId,
        requiredPermission,
      });
    }
  }
}
