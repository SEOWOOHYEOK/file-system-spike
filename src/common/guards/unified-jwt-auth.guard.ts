import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BaseJwtAuthGuard } from './base-jwt-auth.guard';
import { AuthUserLookupService } from '../../business/auth/auth-user-lookup.service';
import { TokenBlacklistService } from '../../business/external-share/security/token-blacklist.service';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';

/**
 * 내부/외부 토큰을 모두 처리하는 통합 JWT 인증 가드
 *
 * 디코드-검증 패턴:
 * 1. jwt.decode(token) 으로 payload.type 확인 (서명 검증 없이)
 * 2. type에 따라 시크릿 선택 (internal → INNER_SECRET, external → EXTERNAL_JWT_SECRET)
 * 3. 선택된 시크릿으로 JWT 서명 검증
 *
 * 보안: type 위조 시그니처 검증 실패로 차단됨 (decode는 시크릿 선택용에만 사용)
 *
 * preVerifyChecks: 외부 토큰인 경우에만 블랙리스트 확인
 * postVerifyChecks: type이 'internal' 또는 'external'인지 검증
 * lookupUser: payload.type으로 lookupInternal / lookupExternal 분기
 */
@Injectable()
export class UnifiedJwtAuthGuard extends BaseJwtAuthGuard {
  constructor(
    jwtService: JwtService,
    configService: ConfigService,
    private readonly authUserLookupService: AuthUserLookupService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {
    super(jwtService, configService);
  }

  /**
   * 토큰을 디코드하여 type에 맞는 시크릿 반환
   * type 없음/알 수 없음 → UnauthorizedException
   */
  protected getSecret(token?: string): string {
    if (!token) {
      throw new UnauthorizedException('토큰이 필요합니다.');
    }

    const payload = this.jwtService.decode(token) as { type?: string } | null;
    if (!payload || typeof payload !== 'object') {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    const type = payload.type;
    if (type === 'external') {
      return this.configService.get<string>('EXTERNAL_JWT_SECRET') ?? '';
    }
    if (type === 'internal') {
      return this.configService.get<string>('INNER_SECRET') ?? '';
    }

    throw new UnauthorizedException('토큰 타입을 확인할 수 없습니다.');
  }

  /**
   * 외부 토큰인 경우에만 블랙리스트 확인
   */
  protected async preVerifyChecks(token: string): Promise<void> {
    const payload = this.jwtService.decode(token) as { type?: string } | null;
    if (payload && payload.type === 'external') {
      if (this.tokenBlacklistService.isBlacklisted(token)) {
        throw new UnauthorizedException('만료된 토큰입니다. 다시 로그인하세요.');
      }
    }
  }

  /**
   * type이 'internal' 또는 'external'인지만 검증
   */
  protected async postVerifyChecks(payload: any): Promise<void> {
    if (payload.type !== 'internal' && payload.type !== 'external') {
      throw new UnauthorizedException('토큰 타입이 올바르지 않습니다.');
    }

    // 외부 토큰: Access Token만 허용
    if (payload.type === 'external' && payload.tokenType && payload.tokenType !== 'access') {
      throw new UnauthorizedException('Access Token이 필요합니다.');
    }
  }

  /**
   * payload.type에 따라 lookupInternal / lookupExternal 분기
   */
  protected async lookupUser(
    userId: string,
    payload?: { type?: string },
  ): Promise<AuthenticatedUser> {
    if (payload?.type === 'external') {
      return this.authUserLookupService.lookupExternal(userId);
    }
    return this.authUserLookupService.lookupInternal(userId);
  }
}
