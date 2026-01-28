import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import {
  EXTERNAL_USER_REPOSITORY,
  type IExternalUserRepository,
  PaginationParams,
  PaginatedResult,
} from '../../domain/external-share/repositories/external-user.repository.interface';
import { ExternalUser } from '../../domain/external-share/entities/external-user.entity';

/**
 * 외부 사용자 생성 DTO
 */
export interface CreateExternalUserDto {
  username: string;
  password: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
}

/**
 * 외부 사용자 수정 DTO
 */
export interface UpdateExternalUserDto {
  name?: string;
  email?: string;
  company?: string;
  phone?: string;
}

/**
 * ExternalUserManagementService
 *
 * 관리자용 외부 사용자 관리 서비스
 * - 외부 사용자 생성/수정/삭제
 * - 계정 활성화/비활성화
 * - 비밀번호 초기화
 */
@Injectable()
export class ExternalUserManagementService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    @Inject(EXTERNAL_USER_REPOSITORY)
    private readonly userRepo: IExternalUserRepository,
  ) {}

  /**
   * 외부 사용자 생성
   */
  async createExternalUser(
    adminId: string,
    dto: CreateExternalUserDto,
  ): Promise<ExternalUser> {
    // username 중복 확인
    const existing = await this.userRepo.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException('Username already exists');
    }

    // 비밀번호 해시
    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const user = new ExternalUser({
      id: uuidv4(),
      username: dto.username,
      passwordHash,
      name: dto.name,
      email: dto.email,
      company: dto.company,
      phone: dto.phone,
      isActive: true,
      createdBy: adminId,
      createdAt: new Date(),
    });

    return this.userRepo.save(user);
  }

  /**
   * 외부 사용자 정보 수정
   */
  async updateExternalUser(
    userId: string,
    dto: UpdateExternalUserDto,
  ): Promise<ExternalUser> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('External user not found');
    }

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.company !== undefined) user.company = dto.company;
    if (dto.phone !== undefined) user.phone = dto.phone;

    return this.userRepo.save(user);
  }

  /**
   * 계정 비활성화
   */
  async deactivateUser(userId: string): Promise<ExternalUser> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('External user not found');
    }

    user.deactivate();
    return this.userRepo.save(user);
  }

  /**
   * 계정 활성화
   */
  async activateUser(userId: string): Promise<ExternalUser> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('External user not found');
    }

    user.activate();
    return this.userRepo.save(user);
  }

  /**
   * 비밀번호 초기화
   * @returns 임시 비밀번호
   */
  async resetPassword(
    userId: string,
  ): Promise<{ temporaryPassword: string }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('External user not found');
    }

    // 임시 비밀번호 생성 (12자리 랜덤)
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, this.SALT_ROUNDS);

    user.updatePassword(passwordHash);
    await this.userRepo.save(user);

    return { temporaryPassword };
  }

  /**
   * 외부 사용자 목록 조회
   */
  async getExternalUsers(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ExternalUser>> {
    return this.userRepo.findAll(pagination);
  }

  /**
   * 외부 사용자 상세 조회
   */
  async getExternalUserById(userId: string): Promise<ExternalUser> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('External user not found');
    }
    return user;
  }

  /**
   * 임시 비밀번호 생성
   */
  private generateTemporaryPassword(): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
