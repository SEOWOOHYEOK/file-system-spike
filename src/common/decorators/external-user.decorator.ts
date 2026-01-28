import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 현재 로그인한 외부 사용자 정보를 추출하는 데코레이터
 */
export const ExternalUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.externalUser;
  },
);
