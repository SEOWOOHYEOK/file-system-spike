import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ShareTarget, ShareTargetType } from '../../domain/share-request/type/share-target.type';
import { ShareRequestDomainService } from '../../domain/share-request/service/share-request-domain.service';
import { PublicShareDomainService } from '../../domain/external-share';
import { FileDomainService } from '../../domain/file';
import { ExternalUserDomainService } from '../../domain/external-share';
import { DomainEmployeeService } from '../../integrations/migration/organization/services/employee.service';
import { FileState } from '../../domain/file/type/file.type';
import { ShareRequestStatus } from '../../domain/share-request/type/share-request-status.enum';

/**
 * 중복 검증 결과
 */
export interface DuplicateConflict {
  fileId: string;
  targetUserId: string;
  targetType: ShareTargetType;
  conflictType: 'ACTIVE_SHARE_EXISTS' | 'PENDING_REQUEST_EXISTS';
  publicShareId?: string;
  expiresAt?: Date;
  shareRequestId?: string;
  requestedAt?: Date;
  requesterName?: string;
}

/**
 * 가용성 확인 결과
 */
export interface AvailabilityResult {
  fileId: string;
  fileName: string;
  target: ShareTarget;
  targetName?: string;
  status: 'AVAILABLE' | 'ACTIVE_SHARE_EXISTS' | 'PENDING_REQUEST_EXISTS';
  conflict?: DuplicateConflict;
}

/**
 * ShareRequest 검증 서비스
 *
 * 파일 공유 요청에 대한 검증 로직을 담당합니다.
 */
@Injectable()
export class ShareRequestValidationService {
  constructor(
    private readonly shareRequestDomainService: ShareRequestDomainService,
    private readonly publicShareDomainService: PublicShareDomainService,
    private readonly fileDomainService: FileDomainService,
    private readonly externalUserDomainService: ExternalUserDomainService,
    private readonly employeeService: DomainEmployeeService,
  ) {}

  /**
   * 중복 방지 검증
   *
   * 모든 (fileId, target.userId) 조합에 대해:
   * 1. 활성 PublicShare 존재 여부 확인 (만료되지 않음, 차단되지 않음, 취소되지 않음)
   * 2. PENDING 상태의 ShareRequest 존재 여부 확인
   *
   * @returns 충돌 목록 (없으면 빈 배열)
   */
  async checkDuplicates(
    fileIds: string[],
    targets: ShareTarget[],
  ): Promise<DuplicateConflict[]> {
    const conflicts: DuplicateConflict[] = [];

    for (const fileId of fileIds) {
      for (const target of targets) {
        // 1. 활성 PublicShare 확인
        const activeShare = await this.findActivePublicShare(fileId, target);
        if (activeShare) {
          conflicts.push({
            fileId,
            targetUserId: target.userId,
            targetType: target.type,
            conflictType: 'ACTIVE_SHARE_EXISTS',
            publicShareId: activeShare.id,
            expiresAt: activeShare.expiresAt,
          });
          continue;
        }

        // 2. PENDING ShareRequest 확인
        const pendingRequest = await this.shareRequestDomainService.대기중요청조회(
          fileId,
          target.userId,
        );
        if (pendingRequest) {
          conflicts.push({
            fileId,
            targetUserId: target.userId,
            targetType: target.type,
            conflictType: 'PENDING_REQUEST_EXISTS',
            shareRequestId: pendingRequest.id,
            requestedAt: pendingRequest.requestedAt,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * 파일 상태 검증
   *
   * 모든 파일이 존재하고 ACTIVE 상태인지 확인합니다.
   *
   * @throws NotFoundException 파일이 존재하지 않는 경우
   * @throws UnprocessableEntityException 파일이 ACTIVE 상태가 아닌 경우
   */
  async validateFiles(fileIds: string[]): Promise<void> {
    for (const fileId of fileIds) {
      const file = await this.fileDomainService.조회(fileId);
      if (!file) {
        throw new NotFoundException(`파일을 찾을 수 없습니다: ${fileId}`);
      }

      if (file.state !== FileState.ACTIVE) {
        throw new UnprocessableEntityException(
          `파일이 활성 상태가 아닙니다: ${fileId} (상태: ${file.state})`,
        );
      }
    }
  }

  /**
   * 대상 사용자 검증
   *
   * 모든 대상 사용자가 존재하는지 확인합니다.
   * - INTERNAL_USER: Employee 존재 확인
   * - EXTERNAL_USER: ExternalUser 존재 확인
   *
   * @throws NotFoundException 대상 사용자가 존재하지 않는 경우
   */
  async validateTargets(targets: ShareTarget[]): Promise<void> {
    for (const target of targets) {
      if (target.type === ShareTargetType.INTERNAL_USER) {
        const employee = await this.employeeService.findOne(target.userId);
        if (!employee) {
          throw new NotFoundException(
            `내부 사용자를 찾을 수 없습니다: ${target.userId}`,
          );
        }
      } else if (target.type === ShareTargetType.EXTERNAL_USER) {
        const externalUser = await this.externalUserDomainService.조회(target.userId);
        if (!externalUser) {
          throw new NotFoundException(
            `외부 사용자를 찾을 수 없습니다: ${target.userId}`,
          );
        }
      }
    }
  }

  /**
   * 사전 확인 (R-0 API용)
   *
   * 파일과 대상에 대한 가용성을 상세히 확인합니다.
   *
   * @returns 각 (fileId, target) 조합에 대한 가용성 결과
   */
  async checkAvailability(
    fileIds: string[],
    targets: ShareTarget[],
  ): Promise<AvailabilityResult[]> {
    const results: AvailabilityResult[] = [];

    for (const fileId of fileIds) {
      // 파일 정보 조회
      const file = await this.fileDomainService.조회(fileId);
      if (!file) {
        // 파일이 없으면 건너뜀 (validateFiles에서 처리)
        continue;
      }

      for (const target of targets) {
        // 대상 사용자 이름 조회
        let targetName: string | undefined;
        if (target.type === ShareTargetType.INTERNAL_USER) {
          const employee = await this.employeeService.findOne(target.userId);
          targetName = employee?.name;
        } else if (target.type === ShareTargetType.EXTERNAL_USER) {
          const externalUser = await this.externalUserDomainService.조회(target.userId);
          targetName = externalUser?.name;
        }

        // 중복 확인
        const conflicts = await this.checkDuplicates([fileId], [target]);
        const conflict = conflicts[0];

        if (conflict) {
          // 충돌 정보 보강 (requesterName)
          if (conflict.shareRequestId) {
            const request = await this.shareRequestDomainService.조회(conflict.shareRequestId);
            if (request) {
              const requesterEmployee = await this.employeeService.findOne(request.requesterId);
              conflict.requesterName = requesterEmployee?.name;
            }
          }

          results.push({
            fileId,
            fileName: file.name,
            target,
            targetName,
            status:
              conflict.conflictType === 'ACTIVE_SHARE_EXISTS'
                ? 'ACTIVE_SHARE_EXISTS'
                : 'PENDING_REQUEST_EXISTS',
            conflict,
          });
        } else {
          results.push({
            fileId,
            fileName: file.name,
            target,
            targetName,
            status: 'AVAILABLE',
          });
        }
      }
    }

    return results;
  }

  /**
   * 활성 PublicShare 찾기
   *
   * 파일과 대상 사용자에 대한 활성 공유를 찾습니다.
   * 활성 = 만료되지 않음 && 차단되지 않음 && 취소되지 않음
   */
  private async findActivePublicShare(
    fileId: string,
    target: ShareTarget,
  ): Promise<import('../../domain/external-share/entities/public-share.entity').PublicShare | null> {
    // 파일의 모든 공유 조회
    const shares = await this.publicShareDomainService.파일별조회(fileId);

    // 대상 사용자와 일치하는 활성 공유 찾기
    for (const share of shares) {
      // 대상 타입에 따라 확인
      if (target.type === ShareTargetType.INTERNAL_USER) {
        if (share.internalUserId === target.userId && share.isValid()) {
          return share;
        }
      } else if (target.type === ShareTargetType.EXTERNAL_USER) {
        if (share.externalUserId === target.userId && share.isValid()) {
          return share;
        }
      }
    }

    return null;
  }
}
