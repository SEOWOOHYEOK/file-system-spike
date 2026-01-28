import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 현재 로그인한 (내부) 사용자 정보를 추출하는 데코레이터
 */
export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
