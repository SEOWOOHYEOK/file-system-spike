import {
  Injectable,
  Inject,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  EXTERNAL_USER_REPOSITORY,
  type IExternalUserRepository,
} from '../../domain/external-share/repositories/external-user.repository.interface';



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
 * 로그인 결과
 */
export interface LoginResult {
  accessToken: string;
  user: {
    id: string;
    username: string;
    name: string;
    email: string;
    company?: string;
  };
}

/**
 * ExternalAuthService
 *
 * 외부 사용자 인증 서비스
 * - 로그인/로그아웃
 * - JWT 토큰 발급
 * - 비밀번호 변경
 */
@Injectable()
export class ExternalAuthService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    @Inject(EXTERNAL_USER_REPOSITORY)
    private readonly userRepo: IExternalUserRepository,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 외부 사용자 로그인
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    // 사용자 조회
    const user = await this.userRepo.findByUsername(dto.username);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 계정 활성 상태 확인
    if (!user.canLogin()) {
      throw new ForbiddenException('Account is deactivated');
    }

    // 비밀번호 검증
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 마지막 로그인 시간 갱신
    user.updateLastLogin();
    await this.userRepo.save(user);

    // JWT 토큰 발급
    const payload = {
      sub: user.id,
      username: user.username,
      type: 'external',
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
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
   * 비밀번호 변경
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 현재 비밀번호 검증
    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // 새 비밀번호 해시 및 저장
    const newPasswordHash = await bcrypt.hash(dto.newPassword, this.SALT_ROUNDS);
    user.updatePassword(newPasswordHash);
    await this.userRepo.save(user);
  }
}
