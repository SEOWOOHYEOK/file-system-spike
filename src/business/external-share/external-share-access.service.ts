import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  PUBLIC_SHARE_REPOSITORY,
  type IPublicShareRepository,
} from '../../domain/external-share/repositories/public-share.repository.interface';
import {
  EXTERNAL_USER_REPOSITORY,
  type IExternalUserRepository,
  PaginationParams,
  PaginatedResult,
} from '../../domain/external-share/repositories/external-user.repository.interface';
import {
  SHARE_ACCESS_LOG_REPOSITORY,
  type IShareAccessLogRepository,
} from '../../domain/external-share/repositories/share-access-log.repository.interface';
import { PublicShare } from '../../domain/external-share/entities/public-share.entity';
import {
  ShareAccessLog,
  AccessAction,
} from '../../domain/external-share/entities/share-access-log.entity';
import { SharePermission } from '../../domain/external-share/type/public-share.type';



/**
 * 콘텐츠 토큰 데이터
 */
interface ContentTokenData {
  shareId: string;
  permission: string;
  used: boolean;
}

/**
 * 접근 요청 파라미터
 */
export interface AccessContentParams {
  externalUserId: string;
  shareId: string;
  token: string;
  action: AccessAction;
  ipAddress: string;
  userAgent: string;
  deviceType: string;
}

/**
 * 접근 결과
 */
export interface AccessResult {
  success: boolean;
  share: PublicShare;
}

/**
 * 공유 상세 결과
 */
export interface ShareDetailResult {
  share: PublicShare;
  contentToken: string;
}

/**
 * ExternalShareAccessService
 *
 * 외부 사용자의 공유 파일 접근 서비스
 * - 공유된 파일 목록 조회
 * - 일회성 콘텐츠 토큰 발급
 * - 6단계 접근 검증 플로우
 * - 접근 로그 기록
 */
@Injectable()
export class ExternalShareAccessService {
  private readonly TOKEN_TTL_SECONDS = 60;

  constructor(
    @Inject(PUBLIC_SHARE_REPOSITORY)
    private readonly shareRepo: IPublicShareRepository,
    @Inject(EXTERNAL_USER_REPOSITORY)
    private readonly userRepo: IExternalUserRepository,
    @Inject(SHARE_ACCESS_LOG_REPOSITORY)
    private readonly logRepo: IShareAccessLogRepository,
    @Inject('REDIS_CLIENT')
    private readonly redis: {
      set: (key: string, value: string, mode: string, duration: number) => Promise<string>;
      get: (key: string) => Promise<string | null>;
      del: (key: string) => Promise<number>;
    },
  ) {}

  /**
   * 나에게 공유된 파일 목록
   */
  async getMyShares(
    externalUserId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    return this.shareRepo.findByExternalUser(externalUserId, pagination);
  }

  /**
   * 공유 상세 조회 및 콘텐츠 토큰 발급
   */
  async getShareDetail(
    externalUserId: string,
    shareId: string,
  ): Promise<ShareDetailResult> {
    const share = await this.shareRepo.findById(shareId);
    if (!share) {
      throw new NotFoundException('Share not found');
    }

    // 본인 공유인지 확인
    if (share.externalUserId !== externalUserId) {
      throw new ForbiddenException('Access denied');
    }

    // 일회성 토큰 생성 및 Redis 저장
    const tokenId = uuidv4();
    const tokenData: ContentTokenData = {
      shareId: share.id,
      permission: 'VIEW', // 기본 VIEW 권한
      used: false,
    };

    await this.redis.set(
      `content-token:${tokenId}`,
      JSON.stringify(tokenData),
      'EX',
      this.TOKEN_TTL_SECONDS,
    );

    return {
      share,
      contentToken: tokenId,
    };
  }

  /**
   * 토큰 검증 및 소비
   */
  async validateAndConsumeToken(
    token: string,
  ): Promise<{ shareId: string; permission: string }> {
    const key = `content-token:${token}`;
    const data = await this.redis.get(key);

    if (!data) {
      throw new Error('INVALID_TOKEN');
    }

    const tokenData: ContentTokenData = JSON.parse(data);

    if (tokenData.used) {
      throw new Error('INVALID_TOKEN');
    }

    // 토큰 삭제 (일회용)
    await this.redis.del(key);

    return {
      shareId: tokenData.shareId,
      permission: tokenData.permission,
    };
  }

  /**
   * 콘텐츠 접근 - 6단계 검증 플로우
   *
   * 1. 토큰 유효성 검증
   * 2. 공유 상태 검증 (isRevoked, isBlocked)
   * 3. 사용자 상태 검증 (isActive)
   * 4. 만료일 검증
   * 5. 횟수 제한 검증 (VIEW/DOWNLOAD)
   * 6. 권한 검증
   */
  async accessContent(params: AccessContentParams): Promise<AccessResult> {
    const { externalUserId, shareId, token, action, ipAddress, userAgent, deviceType } =
      params;

    let share: PublicShare | null = null;

    try {
      // 1. 토큰 유효성 검증
      const tokenData = await this.validateAndConsumeToken(token);
      if (tokenData.shareId !== shareId) {
        throw new Error('INVALID_TOKEN');
      }

      // 공유 조회
      share = await this.shareRepo.findById(shareId);
      if (!share) {
        throw new Error('SHARE_NOT_FOUND');
      }

      // 2. 공유 상태 검증
      if (share.isBlocked) {
        throw new Error('SHARE_BLOCKED');
      }
      if (share.isRevoked) {
        throw new Error('SHARE_REVOKED');
      }

      // 3. 사용자 상태 검증
      const user = await this.userRepo.findById(externalUserId);
      if (!user || !user.isActive) {
        throw new Error('USER_BLOCKED');
      }

      // 4. 만료일 검증
      if (share.isExpired()) {
        throw new Error('SHARE_EXPIRED');
      }

      // 5. 횟수 제한 검증
      if (action === AccessAction.VIEW && share.isViewLimitExceeded()) {
        throw new Error('LIMIT_EXCEEDED');
      }
      if (action === AccessAction.DOWNLOAD && share.isDownloadLimitExceeded()) {
        throw new Error('LIMIT_EXCEEDED');
      }

      // 6. 권한 검증
      const requiredPermission =
        action === AccessAction.VIEW ? SharePermission.VIEW : SharePermission.DOWNLOAD;
      if (!share.hasPermission(requiredPermission)) {
        throw new Error('PERMISSION_DENIED');
      }

      // 모든 검증 통과 - 카운트 증가
      if (action === AccessAction.VIEW) {
        share.incrementViewCount();
      } else {
        share.incrementDownloadCount();
      }
      await this.shareRepo.save(share);

      // 성공 로그 기록
      const successLog = ShareAccessLog.createSuccess({
        publicShareId: shareId,
        externalUserId,
        action,
        ipAddress,
        userAgent,
        deviceType,
      });
      successLog.id = uuidv4();
      await this.logRepo.save(successLog);

      return { success: true, share };
    } catch (error) {
      // 실패 로그 기록
      const failReason = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      const failLog = ShareAccessLog.createFailure({
        publicShareId: shareId,
        externalUserId,
        action,
        ipAddress,
        userAgent,
        deviceType,
        failReason,
      });
      failLog.id = uuidv4();
      await this.logRepo.save(failLog);

      throw error;
    }
  }
}
