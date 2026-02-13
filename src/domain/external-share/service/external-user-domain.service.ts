import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { PaginatedResult, PaginationParams } from '../../../common/types/pagination';
import { createPaginatedResult } from '../../../common/types/pagination';
import type { ExternalUser } from '../entities/external-user.entity';
import { ExternalUser as ExternalUserEntity } from '../entities/external-user.entity';
import { BusinessException, ErrorCodes } from '../../../common/exceptions';
import { DomainEmployeeService } from '../../../integrations/migration/organization/services/employee.service';
import { UserOrmEntity } from '../../../infra/database/entities/user.orm-entity';
import { RoleNameEnum } from '../../role/role-name.enum';

/**
 * ExternalUser 도메인 서비스 (Role 기반)
 *
 * 외부 사용자 = users 테이블에서 role_id로 연결된 roles 테이블의 name이 'GUEST'인 사용자
 * - SSO 인증으로 사용자명/이메일/비밀번호 직접 관리 없음
 * - 조회/활성전체조회/전체조회만 지원
 */
@Injectable()
export class ExternalUserDomainService {
  private readonly logger = new Logger(ExternalUserDomainService.name);

  constructor(
    private readonly employeeService: DomainEmployeeService,
    @InjectRepository(UserOrmEntity)
    private readonly userRepository: Repository<UserOrmEntity>,
  ) {}

  private mapToExternalUser(
    employee: { id: string; employeeNumber: string; name: string; email?: string; createdAt?: Date },
    departmentName: string,
  ): ExternalUser {
    return new ExternalUserEntity({
      id: employee.id,
      username: employee.employeeNumber,
      passwordHash: '',
      name: employee.name,
      email: employee.email ?? '',
      company: departmentName,
      department: departmentName,
      isActive: true,
      createdBy: 'system',
      createdAt: employee.createdAt ?? new Date(),
    });
  }

  /**
   * 외부 사용자 조회 (직원 ID 기준)
   * - users.role_id → roles.name = 'GUEST' 인지 확인 후 반환
   */
  async 조회(id: string): Promise<ExternalUser | null> {
    // GUEST Role 여부 확인
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['role'],
    });

    if (!user?.role || user.role.name !== RoleNameEnum.GUEST) {
      return null;
    }

    const employee = await this.employeeService.findOne(id);
    if (!employee) {
      return null;
    }

    // Employee의 부서 정보는 별도로 가져오지 않음 (Role 기반이므로)
    return this.mapToExternalUser(employee, '');
  }

  /**
   * 여러 외부 사용자 일괄 조회 (ID 목록 기준)
   * - N+1 방지를 위한 배치 조회
   */
  async 아이디목록조회(ids: string[]): Promise<ExternalUser[]> {
    if (ids.length === 0) return [];

    // GUEST Role을 가진 사용자만 필터링
    const guestUsers = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.id IN (:...ids)', { ids })
      .andWhere('role.name = :roleName', { roleName: RoleNameEnum.GUEST })
      .getMany();

    if (guestUsers.length === 0) return [];

    const guestUserIds = guestUsers.map((u) => u.id);

    // Employee 정보를 일괄 조회
    const employees = await Promise.all(
      guestUserIds.map((id) => this.employeeService.findOne(id)),
    );

    return employees
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .map((e) => this.mapToExternalUser(e, ''));
  }

  /**
   * 활성 외부 사용자 전체 조회 (페이지네이션)
   */
  async 활성전체조회(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ExternalUser>> {
    return this.전체조회(pagination);
  }

  /**
   * 전체 외부 사용자 조회 (페이지네이션)
   * - users.role_id → roles.name = 'GUEST' 인 사용자 = 외부 사용자
   */
  async 전체조회(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ExternalUser>> {
    const { page, pageSize } = pagination;

    const [guestUsers, total] = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.name = :roleName', { roleName: RoleNameEnum.GUEST })
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    // Employee 정보를 일괄 조회
    const employees = await Promise.all(
      guestUsers.map((u) => this.employeeService.findOne(u.id)),
    );

    const items = employees
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .map((e) => this.mapToExternalUser(e, ''));

    return createPaginatedResult(items, page, pageSize, total);
  }

  /**
   * 저장 - SSO 환경에서 미지원
   */
  async 저장(_user: ExternalUser): Promise<ExternalUser> {
    throw new NotImplementedException(
      'ExternalUser 저장은 SSO 환경에서 지원되지 않습니다.',
    );
  }

  /**
   * 사용자명 조회 - SSO 환경에서 미지원
   */
  async 사용자명조회(_username: string): Promise<ExternalUser | null> {
    throw new NotImplementedException(
      '사용자명 조회는 SSO 환경에서 지원되지 않습니다.',
    );
  }

  /**
   * 이메일 조회 - SSO 환경에서 미지원
   */
  async 이메일조회(_email: string): Promise<ExternalUser | null> {
    throw new NotImplementedException(
      '이메일 조회는 SSO 환경에서 지원되지 않습니다.',
    );
  }

  /**
   * 삭제 - SSO 환경에서 미지원
   */
  async 삭제(_id: string): Promise<void> {
    throw new NotImplementedException(
      'ExternalUser 삭제는 SSO 환경에서 지원되지 않습니다.',
    );
  }
}
