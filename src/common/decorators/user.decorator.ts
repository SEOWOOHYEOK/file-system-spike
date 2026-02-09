import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';

/**
 * 현재 인증된 사용자 정보를 추출하는 데코레이터
 *
 * 내부/외부 사용자 공통으로 사용됩니다.
 * Guard에서 DB 조회 후 request.user에 설정한 AuthenticatedUser를 반환합니다.
 */
export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
