import {
  Injectable,
  Inject,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { ExternalUserDomainService } from '../../domain/external-share';
import { LoginAttemptService } from './security/login-attempt.service';
import { TokenBlacklistService } from './security/token-blacklist.service';

/**
 * 로그인 DTO
 */
export interface LoginDto {
  username: string;
  password: string;
}

/**
 * 비밀번호 변경 DTO
 */
export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

/**
 * Refresh Token DTO
 */
export interface RefreshTokenDto {
  refreshToken: string;
}

/**
 * 로그인 결과 (Access + Refresh Token)
 */
export interface LoginResult {
  accessToken: string;
  refreshToken: string;

  user: {
    id: string;
    username: string;
    name: string;
    email: string;
    company?: string;
  };
}

/**
 * 토큰 갱신 결과
 */
export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
}

/**
 * ExternalAuthService
 *
 * 외부 사용자 인증 서비스
 *
 * 보안 기능:
 * - 로그인 실패 횟수 제한 (5회 실패 → 30분 잠금)
 * - Access Token + Refresh Token 분리
 * - 토큰 블랙리스트 (로그아웃, 비밀번호 변경 시)
 * - 계정 상태 실시간 검증
 */
@Injectable()
export class ExternalAuthService {
  private readonly SALT_ROUNDS = 10;

  // 토큰 만료 시간 설정
  private readonly ACCESS_TOKEN_EXPIRES_IN = 15 * 60; // 15분 (초)
  private readonly REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60; // 7일 (초)

  constructor(
    private readonly externalUserDomainService: ExternalUserDomainService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly loginAttemptService: LoginAttemptService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  /**
   * 외부 사용자 로그인
   *
   * 보안 체크:
   * 1. 로그인 시도 횟수 확인 (잠금 여부)
   * 2. 사용자 존재 여부
   * 3. 계정 활성 상태
   * 4. 비밀번호 검증
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    // 1. 로그인 시도 가능 여부 확인
    const attemptCheck = this.loginAttemptService.canAttemptLogin(dto.username);
    if (!attemptCheck.allowed) {
      throw new ForbiddenException(
        `계정이 일시적으로 잠겼습니다. ${attemptCheck.lockRemainingSeconds}초 후에 다시 시도하세요.`,
      );
    }

    // 2. 사용자 조회
    const user = await this.externalUserDomainService.사용자명조회(dto.username);
    if (!user) {
      // 실패 기록 (사용자 존재 여부를 노출하지 않기 위해 동일한 메시지)
      this.loginAttemptService.recordFailedAttempt(dto.username);
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
    }

    // 3. 계정 활성 상태 확인
    if (!user.canLogin()) {
      throw new ForbiddenException('계정이 비활성화되었습니다.');
    }

    // 4. 비밀번호 검증
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      const result = this.loginAttemptService.recordFailedAttempt(dto.username);
      if (result.isLocked) {
        throw new ForbiddenException(
          `비밀번호 ${result.failedCount}회 오류. 계정이 30분간 잠겼습니다.`,
        );
      }
      throw new UnauthorizedException(
        `아이디 또는 비밀번호가 올바르지 않습니다. (${result.failedCount}/5회 실패)`,
      );
    }

    // 로그인 성공 → 실패 기록 초기화
    this.loginAttemptService.clearFailedAttempts(dto.username);

    // 마지막 로그인 시간 갱신
    user.updateLastLogin();
    await this.externalUserDomainService.저장(user);

    // 토큰 발급
    const tokens = this.generateTokens(user.id, user.username);

    return {
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        company: user.company,
      },
    };
  }

  /**
   * Access Token 갱신
   */
  async refreshToken(dto: RefreshTokenDto): Promise<RefreshResult> {
    try {
      const secret = this.getJwtSecret();

      // Refresh Token 검증
      const payload = this.jwtService.verify(dto.refreshToken, { secret });

      // 토큰 타입 확인
      if (payload.tokenType !== 'refresh' || payload.type !== 'external') {
        throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.');
      }

      // 블랙리스트 확인
      if (this.tokenBlacklistService.isBlacklisted(dto.refreshToken)) {
        throw new UnauthorizedException('만료된 리프레시 토큰입니다.');
      }

      // 사용자 상태 확인
      const user = await this.externalUserDomainService.조회(payload.sub);
      if (!user || !user.isActive) {
        throw new ForbiddenException('계정이 비활성화되었습니다.');
      }

      // 새 Access Token 발급
      const accessToken = this.jwtService.sign(
        {
          sub: payload.sub,
          username: payload.username,
          type: 'external',
          tokenType: 'access',
        },
        { secret, expiresIn: this.ACCESS_TOKEN_EXPIRES_IN },
      );

      return {
        accessToken,
        expiresIn: this.ACCESS_TOKEN_EXPIRES_IN,
      };
    } catch (error: any) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.');
    }
  }

  /**
   * 로그아웃 (토큰 블랙리스트 추가)
   */
  async logout(accessToken: string, userId: string): Promise<void> {
    try {
      const secret = this.getJwtSecret();
      const payload = this.jwtService.verify(accessToken, { secret });
      const expiresAt = new Date(payload.exp * 1000);

      this.tokenBlacklistService.addToBlacklist(
        accessToken,
        userId,
        'logout',
        expiresAt,
      );
    } catch {
      // 토큰이 이미 만료되었어도 로그아웃은 성공으로 처리
    }
  }

  /**
   * 비밀번호 변경
   * 변경 후 기존 토큰들을 블랙리스트에 추가
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    currentAccessToken?: string,
  ): Promise<void> {
    const user = await this.externalUserDomainService.조회(userId);
    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    // 현재 비밀번호 검증
    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('현재 비밀번호가 올바르지 않습니다.');
    }

    // 새 비밀번호 해시 및 저장
    const newPasswordHash = await bcrypt.hash(dto.newPassword, this.SALT_ROUNDS);
    user.updatePassword(newPasswordHash);
    await this.externalUserDomainService.저장(user);

    // 기존 토큰 무효화
    if (currentAccessToken) {
      try {
        const secret = this.getJwtSecret();
        const payload = this.jwtService.verify(currentAccessToken, { secret });
        const expiresAt = new Date(payload.exp * 1000);

        this.tokenBlacklistService.addToBlacklist(
          currentAccessToken,
          userId,
          'password_change',
          expiresAt,
        );
      } catch {
        // 토큰 검증 실패해도 비밀번호 변경은 완료
      }
    }
  }

  /**
   * 토큰 블랙리스트 확인 (가드에서 사용)
   */
  isTokenBlacklisted(token: string): boolean {
    return this.tokenBlacklistService.isBlacklisted(token);
  }

  /**
   * 외부 사용자 전용 JWT 시크릿 조회
   *
   * 보안 주의:
   * - 내부 사용자(INNER_SECRET/INNER_SECRET)와 완전히 분리된 시크릿 사용
   * - 외부 사용자 토큰으로 내부 API 접근 불가
   * - 시크릿 노출 시 외부 시스템만 영향 (내부 시스템 보호)
   */
  private getJwtSecret(): string {
    const secret = this.configService.get<string>('EXTERNAL_JWT_SECRET');
    if (!secret) {
      throw new Error(
        'EXTERNAL_JWT_SECRET 환경변수가 설정되지 않았습니다. ' +
          '외부 사용자 인증을 위해 반드시 설정해야 합니다.',
      );
    }
    return secret;
  }

  /**
   * Access Token + Refresh Token 생성
   */
  private generateTokens(
    userId: string,
    username: string,
  ): { accessToken: string; refreshToken: string; expiresIn: number } {
    const secret = this.getJwtSecret();

    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        username,
        type: 'external',
        tokenType: 'access',
      },
      { secret, expiresIn: this.ACCESS_TOKEN_EXPIRES_IN },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: userId,
        username,
        type: 'external',
        tokenType: 'refresh',
      },
      { secret, expiresIn: this.REFRESH_TOKEN_EXPIRES_IN },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.ACCESS_TOKEN_EXPIRES_IN,
    };
  }
}
