import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { RequestContext } from '../context/request-context';
import { UserType } from '../../domain/audit/enums/common.enum';

/**
 * JWT 인증 가드
 *
 * Authorization 헤더에서 Bearer 토큰을 추출하고 검증합니다.
 * 검증된 payload는 request.user에 설정됩니다.
 * RequestContext에 사용자 정보를 설정합니다.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('인증 토큰이 필요합니다.');
    }

    try {
      const secret =
        this.configService.get<string>('INNER_SECRET') 

      if (!secret) {
        throw new UnauthorizedException('JWT 시크릿이 설정되지 않았습니다.');
      }

      const payload = await this.jwtService.verifyAsync(token, { secret });

      // request.user에 payload 설정
      request['user'] = payload;

      // RequestContext에 사용자 정보 설정
      // auth.controller.ts의 JWT payload 구조: { id, employeeNumber, name, email }
      RequestContext.setUser({
        userId: payload.id,
        userType: UserType.INTERNAL,
        userName: payload.name,
        userEmail: payload.email,
      });
      
    } catch (error: any) {
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
