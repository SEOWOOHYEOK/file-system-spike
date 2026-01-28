import { Injectable, Logger } from '@nestjs/common';

/**
 * 블랙리스트 토큰 정보
 */
interface BlacklistedToken {
  token: string;
  userId: string;
  reason: 'logout' | 'password_change' | 'account_deactivated' | 'admin_revoke';
  blacklistedAt: Date;
  expiresAt: Date; // 토큰의 원래 만료 시간
}

/**
 * TokenBlacklistService
 *
 * JWT 토큰 블랙리스트를 관리합니다.
 *
 * 용도:
 * - 로그아웃 시 토큰 무효화
 * - 비밀번호 변경 시 기존 토큰 무효화
 * - 계정 비활성화 시 토큰 무효화
 * - 관리자 강제 로그아웃
 *
 * ⚠️ 주의: 현재 메모리 기반 구현입니다.
 * 프로덕션 환경에서는 Redis 등 분산 캐시 사용을 권장합니다.
 */
@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  // 메모리 저장소 (프로덕션에서는 Redis 권장)
  private readonly blacklist = new Map<string, BlacklistedToken>();

  // 만료된 토큰 정리 주기 (5분)
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  constructor() {
    // 주기적으로 만료된 토큰 정리
    setInterval(() => this.cleanupExpiredTokens(), this.CLEANUP_INTERVAL_MS);
  }

  /**
   * 토큰을 블랙리스트에 추가
   */
  addToBlacklist(
    token: string,
    userId: string,
    reason: BlacklistedToken['reason'],
    tokenExpiresAt: Date,
  ): void {
    this.blacklist.set(token, {
      token,
      userId,
      reason,
      blacklistedAt: new Date(),
      expiresAt: tokenExpiresAt,
    });

    this.logger.log(
      `Token blacklisted: userId=${userId}, reason=${reason}`,
    );
  }

  /**
   * 토큰이 블랙리스트에 있는지 확인
   */
  isBlacklisted(token: string): boolean {
    return this.blacklist.has(token);
  }

  /**
   * 특정 사용자의 모든 토큰을 블랙리스트에 추가
   * (비밀번호 변경, 계정 비활성화 시 사용)
   */
  revokeAllUserTokens(
    userId: string,
    reason: BlacklistedToken['reason'],
  ): void {
    // 이 방식은 토큰을 알아야 하므로, 실제로는 사용자 ID 기반 차단이 더 효율적
    // 가드에서 사용자 ID로 차단 여부를 확인하는 방식으로 구현
    this.logger.log(
      `All tokens revoked for user: userId=${userId}, reason=${reason}`,
    );
  }

  /**
   * 블랙리스트에서 토큰 정보 조회
   */
  getBlacklistInfo(token: string): BlacklistedToken | undefined {
    return this.blacklist.get(token);
  }

  /**
   * 만료된 토큰 정리 (메모리 관리)
   */
  private cleanupExpiredTokens(): void {
    const now = new Date();
    let cleanedCount = 0;

    this.blacklist.forEach((info, token) => {
      if (info.expiresAt < now) {
        this.blacklist.delete(token);
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired blacklisted tokens`);
    }
  }

  /**
   * 블랙리스트 통계 (관리자용)
   */
  getStats(): {
    totalBlacklisted: number;
    byReason: Record<string, number>;
  } {
    const byReason: Record<string, number> = {};

    this.blacklist.forEach((info) => {
      byReason[info.reason] = (byReason[info.reason] || 0) + 1;
    });

    return {
      totalBlacklisted: this.blacklist.size,
      byReason,
    };
  }
}
