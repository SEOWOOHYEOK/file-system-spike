import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BaseJwtAuthGuard } from './base-jwt-auth.guard';
import { AuthUserLookupService } from '../../business/auth/auth-user-lookup.service';
import { TokenBlacklistService } from '../../business/external-share/security/token-blacklist.service';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';

/**
 * 외부 사용자 전용 JWT 인증 가드
 *
 * 보안 체크:
 * 1. 토큰 블랙리스트 확인 (로그아웃/비밀번호 변경된 토큰 차단)
 * 2. EXTERNAL_JWT_SECRET으로 토큰 검증
 * 3. 토큰 타입 검증 (type: 'external', tokenType: 'access')
 * 4. DB 조회로 계정 활성 상태 실시간 검증
 *
 * 보안 주의:
 * - 내부 사용자(INNER_SECRET)와 분리된 EXTERNAL_JWT_SECRET 사용
 * - 내부 토큰으로 외부 API 접근 불가, 외부 토큰으로 내부 API 접근 불가
 */
@Injectable()
export class ExternalJwtAuthGuard extends BaseJwtAuthGuard {
  constructor(
    jwtService: JwtService,
    configService: ConfigService,
    private readonly authUserLookupService: AuthUserLookupService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {
    super(jwtService, configService);
  }

  protected getSecret(_token?: string): string {
    return this.configService.get<string>('EXTERNAL_JWT_SECRET') ?? '';
  }

  /**
   * 토큰 블랙리스트 확인 (로그아웃/비밀번호 변경된 토큰)
   */
  protected async preVerifyChecks(token: string): Promise<void> {
    if (this.tokenBlacklistService.isBlacklisted(token)) {
      throw new UnauthorizedException('만료된 토큰입니다. 다시 로그인하세요.');
    }
  }

  /**
   * 토큰 타입 검증:
   * - type이 'external'인지 확인
   * - tokenType이 'access'인지 확인 (Refresh Token으로 API 호출 방지)
   */
  protected async postVerifyChecks(payload: any): Promise<void> {
    if (payload.type !== 'external') {
      throw new UnauthorizedException('토큰 타입이 올바르지 않습니다.');
    }

    if (payload.tokenType && payload.tokenType !== 'access') {
      throw new UnauthorizedException('Access Token이 필요합니다.');
    }
  }

  protected async lookupUser(
    userId: string,
    _payload?: any,
  ): Promise<AuthenticatedUser> {
    return this.authUserLookupService.lookupExternal(userId);
  }
}
