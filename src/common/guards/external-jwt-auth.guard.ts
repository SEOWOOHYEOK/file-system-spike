import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { ExternalUserDomainService } from '../../domain/external-share';
import { TokenBlacklistService } from '../../business/external-share/security/token-blacklist.service';
import { RequestContext } from '../context/request-context';
import { UserType } from '../../domain/audit/enums/common.enum';
/**
 * 외부 사용자 전용 JWT 인증 가드
 *
 * 보안 체크:
 * 1. 토큰 존재 여부
 * 2. 토큰 블랙리스트 확인 (로그아웃/비밀번호 변경된 토큰 차단)
 * 3. 토큰 타입 검증 (type: 'external')
 * 4. 계정 활성 상태 실시간 검증
 *
 * 보안 주의:
 * - 내부 사용자(INNER_SECRET)와 분리된 EXTERNAL_JWT_SECRET 사용
 * - 내부 토큰으로 외부 API 접근 불가, 외부 토큰으로 내부 API 접근 불가
 */
@Injectable()
export class ExternalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly externalUserDomainService: ExternalUserDomainService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('인증 토큰이 필요합니다.');
    }

    // 토큰 블랙리스트 확인 (로그아웃/비밀번호 변경된 토큰)
    if (this.tokenBlacklistService.isBlacklisted(token)) {
      throw new UnauthorizedException('만료된 토큰입니다. 다시 로그인하세요.');
    }

    try {
      // 외부 사용자 전용 시크릿 (내부 사용자와 분리)
      const secret = this.configService.get<string>('EXTERNAL_JWT_SECRET');

      if (!secret) {
        throw new UnauthorizedException(
          'EXTERNAL_JWT_SECRET이 설정되지 않았습니다.',
        );
      }

      // 토큰 검증
      const payload = await this.jwtService.verifyAsync(token, { secret });

      // 외부 사용자 토큰인지 확인
      if (payload.type !== 'external') {
        throw new UnauthorizedException('토큰 타입이 올바르지 않습니다.');
      }

      // Access Token인지 확인 (Refresh Token으로 API 호출 방지)
      if (payload.tokenType && payload.tokenType !== 'access') {
        throw new UnauthorizedException('Access Token이 필요합니다.');
      }

      // 사용자 ID 추출 (sub 또는 id)
      const userId = payload.sub || payload.id;
      if (!userId) {
        throw new UnauthorizedException('토큰에 사용자 정보가 없습니다.');
      }

      // 계정 활성 상태 실시간 검증
      const user = await this.externalUserDomainService.조회(userId);
      if (!user) {
        throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
      }

      if (!user.isActive) {
        throw new ForbiddenException('계정이 비활성화되었습니다.');
      }

      // request에 토큰과 사용자 정보 설정
      request['accessToken'] = token;
      request['externalUser'] = {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        company: user.company,
      };

      // RequestContext에 외부 사용자 정보 설정
      RequestContext.setUser({
        userId: user.id,
        userType: UserType.EXTERNAL,
        userName: user.name,
        userEmail: user.email,
      });
    } catch (error: any) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('토큰이 만료되었습니다.');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('유효하지 않은 토큰입니다.');
      }
      throw new UnauthorizedException(error.message || '인증 실패');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
