import { Injectable, NotImplementedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import type { PaginatedResult, PaginationParams } from '../../../common/types/pagination';
import { createPaginatedResult } from '../../../common/types/pagination';
import type { ExternalUser } from '../entities/external-user.entity';
import { ExternalUser as ExternalUserEntity } from '../entities/external-user.entity';
import { DomainEmployeeService } from '../../../integrations/migration/organization/services/employee.service';
import { EmployeeDepartmentPosition } from '../../../integrations/migration/organization/entities/employee-department-position.entity';

/**
 * ExternalUser 도메인 서비스 (Employee 기반)
 *
 * 외부 사용자 = EXTERNAL_DEPARTMENT_ID 부서에 소속된 직원
 * - SSO 인증으로 사용자명/이메일/비밀번호 직접 관리 없음
 * - 조회/활성전체조회/전체조회만 지원
 */
@Injectable()
export class ExternalUserDomainService {
  constructor(
    private readonly employeeService: DomainEmployeeService,
    @InjectRepository(EmployeeDepartmentPosition)
    private readonly edpRepository: Repository<EmployeeDepartmentPosition>,
    private readonly configService: ConfigService,
  ) {}

  private getExternalDepartmentId(): string {
    const id = this.configService.get<string>('EXTERNAL_DEPARTMENT_ID');
    if (!id) {
      throw new Error('EXTERNAL_DEPARTMENT_ID is not configured');
    }
    return id;
  }

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
   * - EXTERNAL_DEPARTMENT_ID 부서 소속인지 확인 후 반환
   */
  async 조회(id: string): Promise<ExternalUser | null> {
    const externalDepartmentId = this.getExternalDepartmentId();

    const position = await this.edpRepository.findOne({
      where: { employeeId: id, departmentId: externalDepartmentId },
      relations: ['employee', 'department'],
    });

    if (!position?.employee) {
      return null;
    }

    const departmentName = position.department?.departmentName ?? '';
    return this.mapToExternalUser(position.employee, departmentName);
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
   * - EXTERNAL_DEPARTMENT_ID 부서 소속 직원 = 외부 사용자
   */
  async 전체조회(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ExternalUser>> {
    const externalDepartmentId = this.getExternalDepartmentId();
    const { page, pageSize } = pagination;

    const [positions, total] = await this.edpRepository.findAndCount({
      where: { departmentId: externalDepartmentId },
      relations: ['employee', 'department'],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const items = positions
      .filter((p) => p.employee)
      .map((p) =>
        this.mapToExternalUser(
          p.employee!,
          p.department?.departmentName ?? '',
        ),
      );

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
