import {
  Controller,
  Post,
  Patch,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  ExternalAuthService,

} from '../../../business/external-share/external-auth.service';

import type { LoginDto } from '../../../business/external-share/external-auth.service';
import type { ChangePasswordDto } from '../../../business/external-share/external-auth.service';
import { ExternalUser } from '../../../common/decorators/external-user.decorator';
/**
 * 외부 사용자 인증 컨트롤러
 */

@ApiTags('700.외부인증')
@Controller('v1/ext-auth')
export class ExternalAuthController {
  constructor(
    private readonly authService: ExternalAuthService,
  ) {}

  /**
   * 외부 사용자 로그인
   */
  @Post('login')
  @ApiOperation({ summary: '외부 사용자 로그인' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * 로그아웃 (클라이언트에서 토큰 삭제)
   */
  @Post('logout')
  @ApiOperation({ summary: '로그아웃' })
  @ApiBearerAuth()
  async logout() {
    // JWT 기반이므로 클라이언트에서 토큰 삭제로 처리
    return { message: 'Logged out successfully' };
  }

  /**
   * 비밀번호 변경
   */
  @Patch('change-password')
  @ApiOperation({ summary: '비밀번호 변경' })
  @ApiBearerAuth()
  async changePassword(
    @ExternalUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(user.id, dto);
    return { message: 'Password changed successfully' };
  }
}
