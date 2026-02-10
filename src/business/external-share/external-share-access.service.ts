import {
  Injectable,
  HttpException,
  Inject
} from '@nestjs/common';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import { v4 as uuidv4 } from 'uuid';
import type { PaginationParams, PaginatedResult } from '../../common/types/pagination';
import type { RangeInfo } from '../../common/utils';
import {
  CONTENT_TOKEN_STORE,
  type IContentTokenStore,
} from '../../domain/external-share/ports/content-token-store.port';
import { PublicShare } from '../../domain/external-share/entities/public-share.entity';
import {
  ShareAccessLog,
  AccessAction,
} from '../../domain/external-share/entities/share-access-log.entity';
import { SharePermission } from '../../domain/external-share/type/public-share.type';
import {
  ExternalUserDomainService,
  PublicShareDomainService as PublicShareRepositoryService,
  ShareAccessLogDomainService,
} from '../../domain/external-share';
import { PublicShareDomainService } from './public-share-domain.service';
import { FileDownloadService } from '../file/file-download.service';
import type { FileEntity, FileStorageObjectEntity } from '../../domain/file';


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
  /** HTTP Range 헤더 원본 (예: "bytes=0-1023") - 서비스 내부에서 파싱 */
  rangeHeader?: string;
  /** HTTP If-Range 헤더 (ETag 값) - 이어받기 시 파일 변경 감지 */
  ifRangeHeader?: string;
}

/**
 * 접근 결과
 *
 * 파일 스트리밍을 위해 file과 stream도 함께 반환
 */
export interface AccessResult {
  success: boolean;
  share: PublicShare;
  file: FileEntity;
  storageObject: FileStorageObjectEntity;
  stream: NodeJS.ReadableStream | null;
  /** Range 요청에 대한 부분 응답 여부 */
  isPartial: boolean;
  /** 적용된 Range 정보 */
  range?: RangeInfo;
  /** Range 요청이 유효하지 않음 (416 응답 필요) */
  isRangeInvalid?: boolean;
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
 * - 파일 다운로드 (FileDownloadService 연동)
 * - 접근 로그 기록
 */
@Injectable()
export class ExternalShareAccessService {
  private readonly TOKEN_TTL_SECONDS = 60;

  constructor(
    @Inject(CONTENT_TOKEN_STORE)
    private readonly tokenStore: IContentTokenStore,
    private readonly fileDownloadService: FileDownloadService,
    private readonly shareDomainService: PublicShareDomainService,
    private readonly shareRepositoryService: PublicShareRepositoryService,
    private readonly externalUserDomainService: ExternalUserDomainService,
    private readonly shareAccessLogDomainService: ShareAccessLogDomainService,
  ) {}

  /**
   * 나에게 공유된 파일 목록
   *
   * 도메인 서비스를 통해 파일 메타데이터가 채워진 공유 목록을 조회합니다.
   */
  async getMyShares(
    externalUserId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    return this.shareDomainService.findByExternalUserWithFiles(
      externalUserId,
      pagination,
    );
  }

  /**
   * 공유 상세 조회 및 콘텐츠 토큰 발급
   *
   * 도메인 서비스를 통해 파일 메타데이터가 채워진 공유 상세를 조회하고
   * 일회성 콘텐츠 토큰을 발급합니다.
   */
  async getShareDetail(
    externalUserId: string,
    shareId: string,
  ): Promise<ShareDetailResult> {
    const share = await this.shareDomainService.findByIdWithFile(shareId);
    if (!share) {
      throw BusinessException.of(ErrorCodes.EXT_SHARE_NOT_FOUND, { shareId });
    }

    // 본인 공유인지 확인
    if (share.externalUserId !== externalUserId) {
      throw BusinessException.of(ErrorCodes.EXT_SHARE_ACCESS_DENIED, { shareId, externalUserId });
    }

    // 일회성 토큰 생성 및 Redis 저장
    const tokenId = uuidv4();
    const tokenData: ContentTokenData = {
      shareId: share.id,
      permission: 'VIEW', // 기본 VIEW 권한
      used: false,
    };

    await this.tokenStore.set(
      `content-token:${tokenId}`,
      JSON.stringify(tokenData),
      this.TOKEN_TTL_SECONDS,
    );

    return {
      share,
      contentToken: tokenId,
    };
  }

  /**
   * 토큰 검증 및 소비
   *
   * @throws UnauthorizedException - 토큰이 없거나 만료된 경우
   */
  async validateAndConsumeToken(
    token: string,
  ): Promise<{ shareId: string; permission: string }> {
    const key = `content-token:${token}`;
    const data = await this.tokenStore.get(key);

    if (!data) {
      throw BusinessException.of(ErrorCodes.EXT_SHARE_TOKEN_INVALID, { token });
    }

    const tokenData: ContentTokenData = JSON.parse(data);

    if (tokenData.used) {
      throw BusinessException.of(ErrorCodes.EXT_SHARE_TOKEN_USED, { token });
    }

    // 토큰 삭제 (일회용)
    await this.tokenStore.del(key);

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
   *
   * @throws UnauthorizedException - 토큰 문제
   * @throws NotFoundException - 공유가 존재하지 않음
   * @throws ForbiddenException - 권한/상태 문제
   * @throws GoneException - 공유 만료
   * @throws HttpException(429) - 횟수 제한 초과
   */
  async accessContent(params: AccessContentParams): Promise<AccessResult> {
    const { externalUserId, shareId, token, action, ipAddress, userAgent, deviceType } =
      params;

    let share: PublicShare | null = null;
    let failReason: string | null = null;

    try {
      // 관라지에 의해 차단된 것인지 먼저 검증
      const blockedByAdmin = await this.shareDomainService.findByIdWithFile(shareId);
      
      if (blockedByAdmin?.isBlocked) {
        failReason = 'SHARE_BLOCKED_BY_ADMIN';
        throw BusinessException.of(ErrorCodes.EXT_SHARE_BLOCKED, { shareId });
      }


      // 1. 토큰 유효성 검증
      const tokenData = await this.validateAndConsumeToken(token);
      if (tokenData.shareId !== shareId) {
        failReason = 'TOKEN_SHARE_MISMATCH';
        throw BusinessException.of(ErrorCodes.EXT_SHARE_TOKEN_MISMATCH, { shareId, token });
      }

      // 공유 조회
      share = await this.shareRepositoryService.조회(shareId);
      if (!share) {
        failReason = 'SHARE_NOT_FOUND';
        throw BusinessException.of(ErrorCodes.EXT_SHARE_NOT_FOUND, { shareId });
      }

      // 2. 공유 상태 검증
      if (share.isBlocked) {
        failReason = 'SHARE_BLOCKED';
        throw BusinessException.of(ErrorCodes.EXT_SHARE_BLOCKED, { shareId });
      }
      if (share.isRevoked) {
        failReason = 'SHARE_REVOKED';
        throw BusinessException.of(ErrorCodes.EXT_SHARE_REVOKED, { shareId });
      }

      // 3. 사용자 상태 검증
      const user = await this.externalUserDomainService.조회(externalUserId);
      if (!user || !user.isActive) {
        failReason = 'USER_BLOCKED';
        throw BusinessException.of(ErrorCodes.EXT_USER_ACCOUNT_DISABLED, { externalUserId });
      }

      // 4. 만료일 검증
      if (share.isExpired()) {
        failReason = 'SHARE_EXPIRED';
        throw BusinessException.of(ErrorCodes.EXT_SHARE_EXPIRED, { shareId });
      }

      // 5. 횟수 제한 검증
      if (action === AccessAction.VIEW && share.isViewLimitExceeded()) {
        failReason = 'VIEW_LIMIT_EXCEEDED';
        throw BusinessException.of(ErrorCodes.EXT_SHARE_VIEW_LIMIT, { shareId });
      }
      if (action === AccessAction.DOWNLOAD && share.isDownloadLimitExceeded()) {
        failReason = 'DOWNLOAD_LIMIT_EXCEEDED';
        throw BusinessException.of(ErrorCodes.EXT_SHARE_DOWNLOAD_LIMIT, { shareId });
      }

      // 6. 권한 검증
      const requiredPermission =
        action === AccessAction.VIEW ? SharePermission.VIEW : SharePermission.DOWNLOAD;
      if (!share.hasPermission(requiredPermission)) {
        failReason = 'PERMISSION_DENIED';
        throw BusinessException.of(
          action === AccessAction.VIEW
            ? ErrorCodes.EXT_SHARE_VIEW_DENIED
            : ErrorCodes.EXT_SHARE_DOWNLOAD_DENIED,
          { shareId, action },
        );
      }

      // 7. 파일 다운로드 - FileDownloadService 연동 (Range/If-Range 처리 서비스에서 수행)
      // 중요: 다운로드 성공 후에만 카운트를 증가시킴 (실패 시 카운트 차감 방지)
      const downloadResult = await this.fileDownloadService.downloadWithRange(
        share.fileId,
        {
          rangeHeader: params.rangeHeader,
          ifRangeHeader: params.ifRangeHeader,
        },
      );
      
      const { range, isRangeInvalid } = downloadResult;

      // 8. 파일 메타데이터를 share에 채움 (비즈니스 레이어에서 처리)
      share.fileName = downloadResult.file.name;
      share.mimeType = downloadResult.file.mimeType;

      // 9. 다운로드 성공 - 카운트 증가 및 저장
      if (action === AccessAction.VIEW) {
        share.incrementViewCount();
      } else {
        share.incrementDownloadCount();
      }
      await this.shareRepositoryService.저장(share);

      // 9. 성공 로그 기록
      const successLog = ShareAccessLog.createSuccess({
        publicShareId: shareId,
        externalUserId,
        action,
        ipAddress,
        userAgent,
        deviceType,
      });

      successLog.id = uuidv4();
      await this.shareAccessLogDomainService.저장(successLog);

      return {
        success: true,
        share,
        file: downloadResult.file,
        storageObject: downloadResult.storageObject,
        stream: downloadResult.stream,
        isPartial: downloadResult.isPartial,
        range: downloadResult.range,
        isRangeInvalid,
      };
    } catch (error) {
      // 실패 로그 기록 (HttpException의 경우 메시지 추출)
      if (!failReason) {
        if (error instanceof HttpException) {
          failReason = error.message;
        } else if (error instanceof Error) {
          failReason = error.message;
        } else {
          failReason = 'UNKNOWN_ERROR';
        }
      }

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

      await this.shareAccessLogDomainService.저장(failLog);

      throw error;
    }
  }

  /**
   * 파일 다운로드 완료 후 lease 해제
   *
   * 스트림 종료 시 (성공/실패/중단 모두) 반드시 호출되어야 함
   * - stream.on('end') / stream.on('error') / stream.on('close') 이벤트에서 호출
   *
   * @param fileId - 파일 ID
   */
  async releaseLease(fileId: string): Promise<void> {
    await this.fileDownloadService.releaseLease(fileId);
  }
}
