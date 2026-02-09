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
import { ExternalAuthService } from '../../../business/external-share/external-auth.service';
import { User } from '../../../common/decorators/user.decorator';
import { ExternalJwtAuthGuard } from '../../../common/guards';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';
import {
  ApiExternalLogin,
  ApiExternalLogout,
  ApiChangePassword,
  ApiRefreshToken,
} from './external-auth.swagger';
import { ExternalLoginRequestDto, ExternalLoginResponseDto } from './dto/external-login.dto';
import { ChangePasswordRequestDto, ChangePasswordResponseDto } from './dto/change-password.dto';
import {
  ExternalRefreshTokenRequestDto,
  ExternalRefreshTokenResponseDto,
  ExternalLogoutResponseDto,
} from './dto/refresh-token.dto';

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
    private readonly externalAuthService: ExternalAuthService,
  ) { }

  /**
   * 외부 사용자 로그인
   */
  @Post('login')
  @ApiExternalLogin()
  async login(
    @Body() dto: ExternalLoginRequestDto,
  ): Promise<ExternalLoginResponseDto> {
    const result = await this.externalAuthService.login(dto);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };
  }

  /**
   * Access Token 갱신
   */
  @Post('refresh-token')
  @ApiRefreshToken()
  async refreshToken(
    @Body() dto: ExternalRefreshTokenRequestDto,
  ): Promise<ExternalRefreshTokenResponseDto> {
    return this.externalAuthService.refreshToken(dto);
  }

  /**
   * 로그아웃 (토큰 블랙리스트 추가)
   */
  @Post('logout')
  @ApiExternalLogout()
  @ApiBearerAuth()
  @UseGuards(ExternalJwtAuthGuard)
  @AuditAction({
    action: AuditActionEnum.LOGOUT,
    targetType: TargetType.USER,
  })
  async logout(
    @User() user: { id: string },
    @Req() req: Request,
  ): Promise<ExternalLogoutResponseDto> {
    const accessToken = req['accessToken'] as string;
    await this.externalAuthService.logout(accessToken, user.id);
    return { message: 'Logged out successfully' };
  }

  /**
   * 비밀번호 변경 (기존 토큰 무효화)
   */
  @Patch('change-password')
  @ApiChangePassword()
  @ApiBearerAuth()
  @UseGuards(ExternalJwtAuthGuard)
  @AuditAction({
    action: AuditActionEnum.PASSWORD_CHANGE,
    targetType: TargetType.USER,
  })
  async changePassword(
    @User() user: { id: string },
    @Body() dto: ChangePasswordRequestDto,
    @Req() req: Request,
  ): Promise<ChangePasswordResponseDto> {
    const accessToken = req['accessToken'] as string;
    await this.externalAuthService.changePassword(user.id, dto, accessToken);
    return { message: 'Password changed successfully. Please login again.' };
  }
}
