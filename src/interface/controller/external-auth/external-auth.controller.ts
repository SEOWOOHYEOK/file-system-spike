import {
  Controller,
  Post,
  Patch,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import Request from 'express';
import {
  ExternalAuthService,
  type LoginDto,
  type ChangePasswordDto,
  type RefreshTokenDto,
} from '../../../business/external-share/external-auth.service';
import { ExternalUser } from '../../../common/decorators/external-user.decorator';
import { ExternalJwtAuthGuard } from '../../../common/guards';
import {
  ApiExternalLogin,
  ApiExternalLogout,
  ApiChangePassword,
  ApiRefreshToken,
} from './external-auth.swagger';

/**
 * 외부 사용자 인증 컨트롤러
 *
 * 보안 기능:
 * - 로그인 실패 횟수 제한 (5회 실패 → 30분 잠금)
 * - Access Token (15분) + Refresh Token (7일)
 * - 로그아웃 시 토큰 블랙리스트 추가
 */
@ApiTags('700.외부인증')
@Controller('v1/ext-auth')
export class ExternalAuthController {
  constructor(
    private readonly authService: ExternalAuthService,
  ) { }

  /**
   * 외부 사용자 로그인
   */
  @Post('login')
  @ApiExternalLogin()
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * Access Token 갱신
   */
  @Post('refresh-token')
  @ApiRefreshToken()
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  /**
   * 로그아웃 (토큰 블랙리스트 추가)
   */
  @Post('logout')
  @ApiExternalLogout()
  @ApiBearerAuth()
  @UseGuards(ExternalJwtAuthGuard)
  async logout(
    @ExternalUser() user: { id: string },
    @Req() req: Request,
  ) {
    const accessToken = req['accessToken'] as string;
    await this.authService.logout(accessToken, user.id);
    return { message: 'Logged out successfully' };
  }

  /**
   * 비밀번호 변경 (기존 토큰 무효화)
   */
  @Patch('change-password')
  @ApiChangePassword()
  @ApiBearerAuth()
  @UseGuards(ExternalJwtAuthGuard)
  async changePassword(
    @ExternalUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    const accessToken = req['accessToken'] as string;
    await this.authService.changePassword(user.id, dto, accessToken);
    return { message: 'Password changed successfully. Please login again.' };
  }
}
