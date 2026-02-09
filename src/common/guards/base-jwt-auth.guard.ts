import {
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { RequestContext } from '../context/request-context';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';

/**
 * BaseJwtAuthGuard (Abstract)
 *
 * JWT 인증 Guard의 공통 로직을 제공하는 추상 클래스입니다.
 *
 * 공통 흐름:
 * 1. Authorization 헤더에서 Bearer 토큰 추출
 * 2. preVerifyChecks() -- 하위 클래스 훅 (블랙리스트 확인 등)
 * 3. JWT 토큰 검증 (getSecret()으로 시크릿 결정)
 * 4. postVerifyChecks() -- 하위 클래스 훅 (토큰 타입 검증 등)
 * 5. DB 사용자 조회 (lookupUser())
 * 6. request.user / RequestContext 설정
 *
 * 하위 클래스 구현 필수:
 * - getSecret(): JWT 시크릿 반환
 * - lookupUser(): DB에서 사용자 정보 조회
 *
 * 하위 클래스 선택적 오버라이드:
 * - preVerifyChecks(): 토큰 검증 전 추가 체크
 * - postVerifyChecks(): 토큰 검증 후 추가 체크
 */
export abstract class BaseJwtAuthGuard implements CanActivate {
  constructor(
    protected readonly jwtService: JwtService,
    protected readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('인증 토큰이 필요합니다.');
    }

    try {
      // 1. 검증 전 추가 체크 (블랙리스트 등)
      await this.preVerifyChecks(token);

      // 2. JWT 시크릿 확인
      const secret = this.getSecret();
      if (!secret) {
        throw new UnauthorizedException('JWT 시크릿이 설정되지 않았습니다.');
      }

      // 3. 토큰 검증
      const payload = await this.jwtService.verifyAsync(token, { secret });

      // 4. 검증 후 추가 체크 (토큰 타입 등)
      await this.postVerifyChecks(payload);

      // 5. 사용자 ID 추출
      const userId = payload.sub || payload.id;
      if (!userId) {
        throw new UnauthorizedException('토큰에 사용자 정보가 없습니다.');
      }

      // 6. DB에서 사용자 조회 (isActive 검증 포함)
      const user = await this.lookupUser(userId);

      // 7. request.user에 통합 AuthenticatedUser 설정
      request['user'] = user;
      request['accessToken'] = token;

      // 8. RequestContext에 사용자 정보 설정
      RequestContext.setUser({
        userId: user.id,
        userType: user.type,
        userName: user.name,
        userEmail: user.email,
      });
    } catch (error: any) {
      // 이미 NestJS 예외인 경우 그대로 전파
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      // JWT 관련 에러 처리
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

  /**
   * JWT 시크릿 반환 (하위 클래스에서 구현)
   */
  protected abstract getSecret(): string;

  /**
   * DB에서 사용자 조회 (하위 클래스에서 구현)
   * isActive 검증을 포함해야 합니다.
   */
  protected abstract lookupUser(userId: string): Promise<AuthenticatedUser>;

  /**
   * 토큰 검증 전 추가 체크 (선택적 오버라이드)
   * 예: 블랙리스트 확인
   */
  protected async preVerifyChecks(_token: string): Promise<void> {
    // 기본 구현: 아무것도 하지 않음
  }

  /**
   * 토큰 검증 후 추가 체크 (선택적 오버라이드)
   * 예: 토큰 타입 검증
   */
  protected async postVerifyChecks(_payload: any): Promise<void> {
    // 기본 구현: 아무것도 하지 않음
  }

  /**
   * Authorization 헤더에서 Bearer 토큰 추출
   */
  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
