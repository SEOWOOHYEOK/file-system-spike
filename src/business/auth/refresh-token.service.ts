import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { RefreshTokenOrmEntity } from '../../infra/database/entities/refresh-token.orm-entity';

/**
 * RefreshTokenService
 *
 * DMS-API 리프레시 토큰의 생성, 로테이션, 무효화, 배치 정리를 담당합니다.
 *
 * 주요 기능:
 * - createRefreshToken: 로그인 시 리프레시 토큰 생성 (새 family 시작)
 * - rotateRefreshToken: 기존 리프레시 토큰으로 새 액세스/리프레시 토큰 발급
 * - revokeFamily: 탈취 감지 시 family 전체 무효화
 * - revokeAllForUser: 로그아웃 시 사용자의 모든 리프레시 토큰 무효화
 * - cleanupExpired: 만료 레코드 배치 삭제 (Cron)
 *
 * 보안:
 * - 토큰 원문 대신 SHA-256 해시를 저장
 * - 토큰 로테이션: 사용할 때마다 새 토큰 발급, 기존 토큰은 used 처리
 * - 탈취 감지: 이미 used된 토큰 재사용 시 family 전체 무효화
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    @InjectRepository(RefreshTokenOrmEntity)
    private readonly repo: Repository<RefreshTokenOrmEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private generateOpaqueToken(): string {
    return crypto.randomBytes(48).toString('base64url');
  }

  /**
   * 리프레시 토큰 만료 시간(초) 조회
   */
  private getRefreshExpiresIn(userType: string): number {
    if (userType === 'external') {
      return parseInt(
        this.configService.get<string>('EXTERNAL_REFRESH_TOKEN_EXPIRES_IN') || '86400',
        10,
      );
    }
    return parseInt(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') || '1209600',
      10,
    );
  }

  /**
   * 액세스 토큰 만료 시간(초) 조회
   */
  private getAccessExpiresIn(): number {
    return parseInt(
      this.configService.get<string>('ACCESS_TOKEN_EXPIRES_IN') || '1800',
      10,
    );
  }

  /**
   * 액세스 토큰 생성 (JWT)
   */
  createAccessToken(userId: string, userType: string): { accessToken: string; expiresIn: number } {
    const expiresIn = this.getAccessExpiresIn();
    const secret =
      userType === 'external'
        ? this.configService.get<string>('EXTERNAL_JWT_SECRET')
        : this.configService.get<string>('INNER_SECRET');

    const accessToken = this.jwtService.sign(
      { sub: userId, type: userType },
      { secret, expiresIn },
    );

    return { accessToken, expiresIn };
  }

  /**
   * 리프레시 토큰 생성 (로그인 시 호출)
   *
   * 새 family_id를 생성하고 DB에 해시를 저장합니다.
   */
  async createRefreshToken(
    userId: string,
    userType: string,
  ): Promise<{ refreshToken: string; familyId: string }> {
    const refreshToken = this.generateOpaqueToken();
    const tokenHash = this.hashToken(refreshToken);
    const familyId = uuidv4();
    const refreshExpiresIn = this.getRefreshExpiresIn(userType);
    const expiresAt = new Date(Date.now() + refreshExpiresIn * 1000);

    await this.repo.save({
      tokenHash,
      userId,
      userType,
      familyId,
      isUsed: false,
      isRevoked: false,
      expiresAt,
    });

    this.logger.log(`리프레시 토큰 생성됨: userId=${userId}, familyId=${familyId}`);
    return { refreshToken, familyId };
  }

  /**
   * 리프레시 토큰 로테이션
   *
   * 기존 리프레시 토큰을 검증하고:
   * 1. 유효하면 → 기존 토큰 used 처리 + 새 액세스/리프레시 토큰 발급
   * 2. 이미 used면 → 탈취 감지 → family 전체 무효화
   * 3. revoked/만료면 → 에러
   */
  async rotateRefreshToken(oldRefreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const tokenHash = this.hashToken(oldRefreshToken);

    const existing = await this.repo.findOne({ where: { tokenHash } });

    // 1. 토큰이 존재하지 않음
    if (!existing) {
      throw new UnauthorizedException({
        error: 'INVALID_REFRESH_TOKEN',
        message: '유효하지 않은 리프레시 토큰입니다.',
      });
    }

    // 2. 이미 사용된 토큰 → 탈취 감지
    if (existing.isUsed) {
      this.logger.warn(
        `토큰 재사용 감지: familyId=${existing.familyId}, userId=${existing.userId}`,
      );
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException({
        error: 'TOKEN_REUSE_DETECTED',
        message: '보안 위협이 감지되었습니다. 다시 로그인하세요.',
      });
    }

    // 3. 강제 무효화된 토큰
    if (existing.isRevoked) {
      throw new UnauthorizedException({
        error: 'TOKEN_REVOKED',
        message: '토큰이 무효화되었습니다.',
      });
    }

    // 4. 만료된 토큰
    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException({
        error: 'REFRESH_TOKEN_EXPIRED',
        message: '리프레시 토큰이 만료되었습니다. 다시 로그인하세요.',
      });
    }

    // 기존 토큰을 used 처리
    await this.repo.update(existing.id, { isUsed: true });

    // 새 리프레시 토큰 생성 (같은 family)
    const newRefreshToken = this.generateOpaqueToken();
    const newTokenHash = this.hashToken(newRefreshToken);
    const refreshExpiresIn = this.getRefreshExpiresIn(existing.userType);
    const expiresAt = new Date(Date.now() + refreshExpiresIn * 1000);

    await this.repo.save({
      tokenHash: newTokenHash,
      userId: existing.userId,
      userType: existing.userType,
      familyId: existing.familyId,
      isUsed: false,
      isRevoked: false,
      expiresAt,
    });

    // 새 액세스 토큰 생성
    const { accessToken, expiresIn } = this.createAccessToken(
      existing.userId,
      existing.userType,
    );

    this.logger.log(
      `리프레시 토큰 로테이션 완료: userId=${existing.userId}, familyId=${existing.familyId}`,
    );

    return { accessToken, refreshToken: newRefreshToken, expiresIn };
  }

  /**
   * family 전체 무효화 (탈취 감지 시)
   */
  async revokeFamily(familyId: string): Promise<void> {
    await this.repo.update({ familyId }, { isRevoked: true });
    this.logger.warn(`토큰 패밀리 무효화: familyId=${familyId}`);
  }

  /**
   * 사용자의 모든 활성 리프레시 토큰 무효화 (로그아웃 시)
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
    this.logger.log(`모든 리프레시 토큰 무효화: userId=${userId}`);
  }

  /**
   * 만료된 리프레시 토큰 레코드 삭제 (배치 정리)
   */
  @Cron('0 */10 * * * *') // 10분마다
  async cleanupExpired(): Promise<void> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .from(RefreshTokenOrmEntity)
      .where('expires_at < :now', { now: new Date() })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.debug(`만료된 리프레시 토큰 ${result.affected}개 정리 완료`);
    }
  }
}
