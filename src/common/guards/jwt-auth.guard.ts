import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BaseJwtAuthGuard } from './base-jwt-auth.guard';
import { AuthUserLookupService } from '../../business/auth/auth-user-lookup.service';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';

/**
 * 내부 사용자 JWT 인증 가드
 *
 * Authorization 헤더에서 Bearer 토큰을 추출하고 INNER_SECRET으로 검증합니다.
 * 검증 후 DB에서 사용자 정보를 조회하여 request.user에 설정합니다.
 *
 * 보안:
 * - JWT payload에는 userId만 포함 (개인정보 노출 방지)
 * - DB 조회를 통해 isActive 실시간 검증 (비활성 사용자 차단)
 * - RequestContext에 사용자 정보 자동 설정
 */
@Injectable()
export class JwtAuthGuard extends BaseJwtAuthGuard {
  constructor(
    jwtService: JwtService,
    configService: ConfigService,
    private readonly authUserLookupService: AuthUserLookupService,
  ) {
    super(jwtService, configService);
  }

  protected getSecret(): string {
    return this.configService.get<string>('INNER_SECRET') ?? '';
  }

  protected async lookupUser(userId: string): Promise<AuthenticatedUser> {
    return this.authUserLookupService.lookupInternal(userId);
  }
}
