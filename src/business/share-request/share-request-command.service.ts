import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ShareRequest } from '../../domain/share-request/entities/share-request.entity';
import { ShareRequestStatus } from '../../domain/share-request/type/share-request-status.enum';
import { ShareTarget, ShareTargetType } from '../../domain/share-request/type/share-target.type';
import { Permission, SharePermissionType } from '../../domain/share-request/type/share-permission.type';
import { ShareRequestDomainService } from '../../domain/share-request/service/share-request-domain.service';
import { ShareRequestValidationService } from './share-request-validation.service';
import { PublicShareDomainService } from '../../domain/external-share';
import { PublicShare } from '../../domain/external-share/entities/public-share.entity';
import { SharePermission } from '../../domain/external-share/type/public-share.type';
import { PermissionEnum } from '../../domain/role/permission.enum';
import { UserService } from '../user/user.service';

/**
 * 공유 요청 생성 DTO
 */
export interface CreateShareRequestDto {
  fileIds: string[];
  targets: ShareTarget[];
  permission: Permission;
  startAt: Date;
  endAt: Date;
  reason: string;
}

/**
 * ShareRequest 명령 서비스
 *
 * 파일 공유 요청의 생성, 승인, 거부, 취소, 일괄 처리를 담당합니다.
 */
@Injectable()
export class ShareRequestCommandService {
  constructor(
    private readonly shareRequestDomainService: ShareRequestDomainService,
    private readonly validationService: ShareRequestValidationService,
    private readonly publicShareDomainService: PublicShareDomainService,
    private readonly userService: UserService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 공유 요청 생성 (R-1)
   *
   * 처리 플로우:
   * 1. 파일 검증
   * 2. 대상 사용자 검증
   * 3. 날짜 검증 (startAt < endAt)
   * 4. 중복 확인 → 충돌 시 409
   * 5. 요청자 권한 확인 (FILE_SHARE_DIRECT 또는 FILE_SHARE_REQUEST)
   * 6. ShareRequest 생성 (status=PENDING)
   * 7. 자동 승인 분기:
   *    - FILE_SHARE_DIRECT 권한 있음 → 즉시 승인 및 PublicShare 생성
   *    - 그 외 → PENDING 상태로 저장
   */
  async createShareRequest(
    requesterId: string,
    dto: CreateShareRequestDto,
  ): Promise<ShareRequest> {
    // Step 1: 파일 검증
    await this.validationService.validateFiles(dto.fileIds);

    // Step 2: 대상 사용자 검증
    await this.validationService.validateTargets(dto.targets);

    // Step 3: 날짜 검증
    if (dto.startAt >= dto.endAt) {
      throw new BadRequestException('시작일은 종료일보다 이전이어야 합니다.');
    }

    // Step 4: 중복 확인
    const conflicts = await this.validationService.checkDuplicates(
      dto.fileIds,
      dto.targets,
    );
    if (conflicts.length > 0) {
      const conflict = conflicts[0];
      if (conflict.conflictType === 'ACTIVE_SHARE_EXISTS') {
        throw new ConflictException(
          `이미 활성 공유가 존재합니다: 파일 ${conflict.fileId}, 사용자 ${conflict.targetUserId}`,
        );
      } else {
        throw new ConflictException(
          `대기 중인 요청이 존재합니다: 파일 ${conflict.fileId}, 사용자 ${conflict.targetUserId}`,
        );
      }
    }

    // Step 5: 요청자 권한 확인
    const { user, role } = await this.userService.findByIdWithRole(requesterId);
    if (!user.isActive) {
      throw new ForbiddenException('비활성 사용자는 요청을 생성할 수 없습니다.');
    }
    if (!role) {
      throw new ForbiddenException('권한이 없습니다.');
    }

    const userPermissions = role.permissions.map((p) => p.code as PermissionEnum);
    const hasDirectPermission = userPermissions.includes(PermissionEnum.FILE_SHARE_DIRECT);
    const hasRequestPermission = userPermissions.includes(PermissionEnum.FILE_SHARE_REQUEST);

    if (!hasDirectPermission && !hasRequestPermission) {
      throw new ForbiddenException(
        '파일 공유 권한이 없습니다. (FILE_SHARE_DIRECT 또는 FILE_SHARE_REQUEST 필요)',
      );
    }

    // Step 6: ShareRequest 생성
    const shareRequest = new ShareRequest({
      id: uuidv4(),
      status: ShareRequestStatus.PENDING,
      fileIds: dto.fileIds,
      requesterId,
      targets: dto.targets,
      permission: dto.permission,
      startAt: dto.startAt,
      endAt: dto.endAt,
      reason: dto.reason,
      isAutoApproved: false,
      publicShareIds: [],
      requestedAt: new Date(),
    });

    // Step 7: 자동 승인 분기
    if (hasDirectPermission) {
      // 자동 승인: 즉시 승인 및 PublicShare 생성
      return await this.autoApproveRequest(shareRequest, requesterId);
    } else {
      // 일반 요청: PENDING 상태로 저장
      return await this.shareRequestDomainService.저장(shareRequest);
    }
  }

  /**
   * 자동 승인 처리 (내부용)
   *
   * ShareRequest를 즉시 승인하고 PublicShare를 생성합니다.
   */
  private async autoApproveRequest(
    shareRequest: ShareRequest,
    approverId: string,
  ): Promise<ShareRequest> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // ShareRequest 승인
      shareRequest.approve(approverId, '자동 승인 (FILE_SHARE_DIRECT 권한)');
      shareRequest.isAutoApproved = true;

      // PublicShare 생성
      const publicShareIds = await this.createPublicShares(shareRequest);
      shareRequest.publicShareIds = publicShareIds;

      // ShareRequest 저장
      const savedRequest = await this.shareRequestDomainService.저장(shareRequest);

      await queryRunner.commitTransaction();
      return savedRequest;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 승인 (A-4 및 자동 승인)
   *
   * 처리 플로우:
   * 1. ShareRequest 조회 및 PENDING 상태 확인
   * 2. 엔티티 승인 메서드 호출
   * 3. 각 (fileId × target) 조합에 대해 PublicShare 생성
   * 4. ShareRequest.publicShareIds 업데이트
   * 5. ShareRequest 저장
   */
  async approveRequest(
    requestId: string,
    approverId: string,
    comment?: string,
  ): Promise<ShareRequest> {
    // Step 1: ShareRequest 조회 및 검증
    const shareRequest = await this.shareRequestDomainService.조회(requestId);
    if (!shareRequest) {
      throw new NotFoundException(`공유 요청을 찾을 수 없습니다: ${requestId}`);
    }

    if (!shareRequest.isDecidable()) {
      throw new BadRequestException(
        `승인할 수 없는 상태입니다: ${shareRequest.status}`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 2: 엔티티 승인 메서드 호출
      try {
        shareRequest.approve(approverId, comment);
      } catch (error) {
        throw new BadRequestException(error.message);
      }

      // Step 3: PublicShare 생성
      const publicShareIds = await this.createPublicShares(shareRequest);
      shareRequest.publicShareIds = publicShareIds;

      // Step 4-5: ShareRequest 저장
      const savedRequest = await this.shareRequestDomainService.저장(shareRequest);

      await queryRunner.commitTransaction();
      return savedRequest;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 반려 (A-5)
   *
   * 처리 플로우:
   * 1. ShareRequest 조회 및 PENDING 상태 확인
   * 2. 엔티티 반려 메서드 호출 (comment 필수)
   * 3. ShareRequest 저장
   */
  async rejectRequest(
    requestId: string,
    approverId: string,
    comment: string,
  ): Promise<ShareRequest> {
    // Step 1: ShareRequest 조회 및 검증
    const shareRequest = await this.shareRequestDomainService.조회(requestId);
    if (!shareRequest) {
      throw new NotFoundException(`공유 요청을 찾을 수 없습니다: ${requestId}`);
    }

    if (!shareRequest.isDecidable()) {
      throw new BadRequestException(
        `반려할 수 없는 상태입니다: ${shareRequest.status}`,
      );
    }

    // Step 2: 엔티티 반려 메서드 호출
    try {
      shareRequest.reject(approverId, comment);
    } catch (error) {
      throw new BadRequestException(error.message);
    }

    // Step 3: ShareRequest 저장
    return await this.shareRequestDomainService.저장(shareRequest);
  }

  /**
   * 취소 (R-4)
   *
   * 처리 플로우:
   * 1. ShareRequest 조회 및 PENDING 상태 확인
   * 2. 요청자 일치 확인 (소유자만 취소 가능)
   * 3. 엔티티 취소 메서드 호출
   * 4. ShareRequest 저장
   */
  async cancelRequest(
    requestId: string,
    requesterId: string,
  ): Promise<ShareRequest> {
    // Step 1: ShareRequest 조회 및 검증
    const shareRequest = await this.shareRequestDomainService.조회(requestId);
    if (!shareRequest) {
      throw new NotFoundException(`공유 요청을 찾을 수 없습니다: ${requestId}`);
    }

    if (!shareRequest.isDecidable()) {
      throw new BadRequestException(
        `취소할 수 없는 상태입니다: ${shareRequest.status}`,
      );
    }

    // Step 2: 요청자 일치 확인
    if (shareRequest.requesterId !== requesterId) {
      throw new ForbiddenException('본인이 요청한 공유만 취소할 수 있습니다.');
    }

    // Step 3: 엔티티 취소 메서드 호출
    try {
      shareRequest.cancel();
    } catch (error) {
      throw new BadRequestException(error.message);
    }

    // Step 4: ShareRequest 저장
    return await this.shareRequestDomainService.저장(shareRequest);
  }

  /**
   * 일괄 승인 (A-6)
   *
   * 처리 플로우:
   * 1. 모든 요청 조회
   * 2. 모든 요청이 PENDING 상태인지 확인
   * 3. 각 요청에 대해 중복 재검증 (동시성 보호)
   * 4. 트랜잭션 내에서 모든 요청 승인
   */
  async bulkApprove(
    ids: string[],
    approverId: string,
    comment?: string,
  ): Promise<ShareRequest[]> {
    // Step 1: 모든 요청 조회
    const requests = await this.shareRequestDomainService.다건조회(ids);
    if (requests.length !== ids.length) {
      throw new NotFoundException('일부 요청을 찾을 수 없습니다.');
    }

    // Step 2: 모든 요청이 PENDING 상태인지 확인
    const nonPendingRequests = requests.filter((r) => !r.isDecidable());
    if (nonPendingRequests.length > 0) {
      throw new BadRequestException(
        `승인할 수 없는 상태의 요청이 있습니다: ${nonPendingRequests.map((r) => r.id).join(', ')}`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const approvedRequests: ShareRequest[] = [];

      // Step 3-4: 각 요청에 대해 중복 재검증 및 승인
      for (const request of requests) {
        // 중복 재검증 (동시성 보호)
        const conflicts = await this.validationService.checkDuplicates(
          request.fileIds,
          request.targets,
        );
        if (conflicts.length > 0) {
          await queryRunner.rollbackTransaction();
          const conflict = conflicts[0];
          throw new ConflictException(
            `요청 ${request.id}에 대한 중복이 발견되었습니다: ${conflict.conflictType}`,
          );
        }

        // 승인 처리
        try {
          request.approve(approverId, comment);
        } catch (error) {
          await queryRunner.rollbackTransaction();
          throw new BadRequestException(`요청 ${request.id} 승인 실패: ${error.message}`);
        }

        // PublicShare 생성
        const publicShareIds = await this.createPublicShares(request);
        request.publicShareIds = publicShareIds;

        // 저장
        const saved = await this.shareRequestDomainService.저장(request);
        approvedRequests.push(saved);
      }

      await queryRunner.commitTransaction();
      return approvedRequests;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 일괄 반려 (A-7)
   *
   * 처리 플로우:
   * 1. 모든 요청 조회
   * 2. 모든 요청이 PENDING 상태인지 확인
   * 3. 트랜잭션 내에서 모든 요청 반려
   */
  async bulkReject(
    ids: string[],
    approverId: string,
    comment: string,
  ): Promise<ShareRequest[]> {
    // Step 1: 모든 요청 조회
    const requests = await this.shareRequestDomainService.다건조회(ids);
    if (requests.length !== ids.length) {
      throw new NotFoundException('일부 요청을 찾을 수 없습니다.');
    }

    // Step 2: 모든 요청이 PENDING 상태인지 확인
    const nonPendingRequests = requests.filter((r) => !r.isDecidable());
    if (nonPendingRequests.length > 0) {
      throw new BadRequestException(
        `반려할 수 없는 상태의 요청이 있습니다: ${nonPendingRequests.map((r) => r.id).join(', ')}`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const rejectedRequests: ShareRequest[] = [];

      // Step 3: 모든 요청 반려
      for (const request of requests) {
        try {
          request.reject(approverId, comment);
        } catch (error) {
          await queryRunner.rollbackTransaction();
          throw new BadRequestException(`요청 ${request.id} 반려 실패: ${error.message}`);
        }

        const saved = await this.shareRequestDomainService.저장(request);
        rejectedRequests.push(saved);
      }

      await queryRunner.commitTransaction();
      return rejectedRequests;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * PublicShare 생성 (내부 헬퍼)
   *
   * ShareRequest의 각 (fileId × target) 조합에 대해 PublicShare를 생성합니다.
   *
   * @returns 생성된 PublicShare ID 배열
   */
  private async createPublicShares(shareRequest: ShareRequest): Promise<string[]> {
    const publicShareIds: string[] = [];

    for (const fileId of shareRequest.fileIds) {
      for (const target of shareRequest.targets) {
        // Permission 타입을 SharePermission 배열로 변환
        // SharePermissionType과 SharePermission은 같은 값이지만 다른 타입이므로 문자열로 변환
        const permissionValue = shareRequest.permission.type as unknown as SharePermission;
        const permissions: SharePermission[] = [permissionValue];

        // PublicShare 생성
        const publicShare = new PublicShare({
          id: uuidv4(),
          fileId,
          ownerId: shareRequest.requesterId,
          externalUserId:
            target.type === ShareTargetType.EXTERNAL_USER ? target.userId : undefined,
          internalUserId:
            target.type === ShareTargetType.INTERNAL_USER ? target.userId : undefined,
          permissions,
          maxDownloadCount: shareRequest.permission.maxDownloads,
          startAt: shareRequest.startAt,
          expiresAt: shareRequest.endAt,
          isBlocked: false,
          isRevoked: false,
          currentViewCount: 0,
          currentDownloadCount: 0,
          createdAt: new Date(),
        });

        // 저장
        const saved = await this.publicShareDomainService.저장(publicShare);
        publicShareIds.push(saved.id);
      }
    }

    return publicShareIds;
  }
}
