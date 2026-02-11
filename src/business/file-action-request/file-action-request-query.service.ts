import { Injectable } from '@nestjs/common';
import { FileActionRequestDomainService } from '../../domain/file-action-request/services/file-action-request-domain.service';
import { FileActionRequestStatus } from '../../domain/file-action-request/enums/file-action-request-status.enum';
import { FileActionType } from '../../domain/file-action-request/enums/file-action-type.enum';
import { UserService } from '../user/user.service';
import { PermissionEnum } from '../../domain/role/permission.enum';
import type { FileActionRequestFilter } from '../../domain/file-action-request/repositories/file-action-request.repository.interface';
import type { PaginationParams } from '../../common/types/pagination';

@Injectable()
export class FileActionRequestQueryService {
  constructor(
    private readonly domainService: FileActionRequestDomainService,
    private readonly userService: UserService,
  ) {}

  async getMyRequests(userId: string, filter: FileActionRequestFilter, pagination: PaginationParams) {
    return this.domainService.필터조회({ ...filter, requesterId: userId }, pagination);
  }

  async getMyPendingApprovals(approverId: string, pagination: PaginationParams) {
    return this.domainService.필터조회(
      { designatedApproverId: approverId, status: FileActionRequestStatus.PENDING },
      pagination,
    );
  }

  async getAllRequests(filter: FileActionRequestFilter, pagination: PaginationParams) {
    return this.domainService.필터조회(filter, pagination);
  }

  async getRequestDetail(id: string) {
    return this.domainService.조회(id);
  }

  async getSummary() {
    return this.domainService.상태별카운트();
  }

  /** 승인 가능 사용자 목록 (해당 권한 보유자) */
  async getApprovers(type: FileActionType) {
    const permission = type === FileActionType.MOVE
      ? PermissionEnum.FILE_MOVE_APPROVE
      : PermissionEnum.FILE_DELETE_APPROVE;
    return this.userService.findUsersByPermission(permission);
  }
}
