import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { TokenBlacklistOrmEntity } from '../../../infra/database/entities/token-blacklist.orm-entity';

/**
 * 블랙리스트 토큰 reason 타입
 */
export type BlacklistReason =
  | 'logout'
  | 'password_change'
  | 'account_deactivated'
  | 'admin_revoke';

/**
 * TokenBlacklistService
 *
 * JWT 토큰 블랙리스트를 DB에 저장하고 관리합니다.
 *
 * 용도:
 * - 로그아웃 시 토큰 무효화 (internal/external 모두)
 * - 비밀번호 변경 시 기존 토큰 무효화
 * - 계정 비활성화 시 토큰 무효화
 * - 관리자 강제 로그아웃
 *
 * 보안: 토큰 원문 대신 SHA-256 해시를 저장합니다.
 */
@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  constructor(
    @InjectRepository(TokenBlacklistOrmEntity)
    private readonly repo: Repository<TokenBlacklistOrmEntity>,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * 토큰을 블랙리스트에 추가
   */
  async addToBlacklist(
    token: string,
    userId: string,
    userType: string,
    reason: BlacklistReason,
    tokenExpiresAt: Date,
  ): Promise<void> {
    const tokenHash = this.hashToken(token);

    const existing = await this.repo.findOne({ where: { tokenHash } });
    if (existing) {
      this.logger.debug(`토큰 이미 블랙리스트에 있음: userId=${userId}`);
    return;
    }

    await this.repo.save({
      tokenHash,
      userId,
      userType,
      reason,
      expiresAt: tokenExpiresAt,
    });

    this.logger.log(`토큰 블랙리스트에 추가: userId=${userId}, reason=${reason}`);
  }

  /**
   * 토큰이 블랙리스트에 있는지 확인
   * expires_at >= now 인 레코드만 유효 (만료된 토큰은 이미 무효화됨)
   */
  async isBlacklisted(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);
    const now = new Date();

    const active = await this.repo
      .createQueryBuilder('tb')
      .where('tb.token_hash = :hash', { hash: tokenHash })
      .andWhere('tb.expires_at >= :now', { now })
      .getOne();

    return !!active;
  }

  /**
   * 만료된 블랙리스트 레코드 삭제 (배치 정리)
   */
  @Cron('0 */5 * * * *') // 5분마다
  async cleanupExpiredTokens(): Promise<void> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .from(TokenBlacklistOrmEntity)
      .where('expires_at < :now', { now: new Date() })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.debug(`만료된 블랙리스트 레코드 삭제 완료 ${result.affected}개`);
    }
  }

  /**
   * 블랙리스트 통계 (관리자용)
   */
  async getStats(): Promise<{
    totalBlacklisted: number;
    byReason: Record<string, number>;
  }> {
    const now = new Date();
    const rows = await this.repo
      .createQueryBuilder('tb')
      .where('tb.expires_at >= :now', { now })
      .getMany();

    const byReason: Record<string, number> = {};
    rows.forEach((r) => {
      byReason[r.reason] = (byReason[r.reason] || 0) + 1;
    });

    return {
      totalBlacklisted: rows.length,
      byReason,
    };
  }
}
