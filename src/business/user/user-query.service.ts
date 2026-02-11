import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { createPaginatedResult, type PaginationParams, type PaginatedResult } from '../../common/types/pagination';
import { RoleNameEnum } from '../../domain/role/role-name.enum';
import type { UserFilterQueryDto } from '../../interface/controller/admin/user/dto/user-admin-query.dto';
import type { UserWithEmployeeResponseDto } from '../../interface/controller/admin/user/dto/user-admin-response.dto';
import type { DepartmentPositionResponseDto } from '../../interface/controller/user/dto/user-with-employee-response.dto';
/**
 * User Query 서비스
 *
 * User + Employee 크로스 도메인 조회 담당
 * - DDD 원칙상 Repository는 단일 Aggregate만 담당해야 함
 * - 크로스 도메인 조회는 Business Layer의 Query Service에서 처리
 */
@Injectable()
export class UserQueryService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * User + Employee 정보 조회 (필터링 지원)
   *
   * 성능 최적화: 2개 쿼리로 N+1 문제 해결
   * 1. User + Employee 조인 조회
   * 2. 모든 Employee의 부서/직책 일괄 조회 후 메모리에서 매핑
   */
  async findAllWithEmployee(
    filter: UserFilterQueryDto,
  ): Promise<UserWithEmployeeResponseDto[]> {
    // 동적 WHERE 절 구성
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.employeeName) {
      conditions.push(`e.name ILIKE $${paramIndex}`);
      params.push(`%${filter.employeeName}%`);
      paramIndex++;
    }
    if (filter.employeeNumber) {
      conditions.push(`e."employeeNumber" ILIKE $${paramIndex}`);
      params.push(`%${filter.employeeNumber}%`);
      paramIndex++;
    }
    if (filter.status) {
      conditions.push(`e.status = $${paramIndex}`);
      params.push(filter.status);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 1. User + Employee 조회 (단일 쿼리)
    const userSql = `
      SELECT 
        u.id AS "id",
        u.is_active AS "isActive",
        u.role_id AS "roleId",
        u.created_at AS "createdAt",
        u.updated_at AS "updatedAt",
        e."employeeNumber" AS "employeeNumber",
        e.name AS "name",
        e.email AS "email",
        e."phoneNumber" AS "phoneNumber",
        e."hireDate" AS "hireDate",
        e.status AS "status"
      FROM users u
      LEFT JOIN "employees-info" e ON u.id = e.id
      ${whereClause}
      ORDER BY e.name ASC
    `;

    const users = await this.dataSource.query(userSql, params);

    if (users.length === 0) {
      return [];
    }

    // 2. 모든 Employee의 부서/직책 일괄 조회 (단일 쿼리)
    const employeeIds = users
      .filter((u: any) => u.employeeNumber)
      .map((u: any) => u.id);

    const deptPosMap = await this.getAllDepartmentPositions(employeeIds);

    // 3. 메모리에서 매핑
    return users.map((user: any) => ({
      id: user.id,
      isActive: user.isActive,
      roleId: user.roleId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      employee: user.employeeNumber
        ? {
            employeeNumber: user.employeeNumber,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            hireDate: user.hireDate,
            status: user.status,
            departmentPositions: deptPosMap.get(user.id) || [],
          }
        : null,
    }));
  }

  /**
   * 여러 Employee의 부서/직책 정보 일괄 조회
   * @returns Map<employeeId, DepartmentPositionResponseDto[]>
   */
  private async getAllDepartmentPositions(
    employeeIds: string[],
  ): Promise<Map<string, DepartmentPositionResponseDto[]>> {
    const result = new Map<string, DepartmentPositionResponseDto[]>();

    if (employeeIds.length === 0) {
      return result;
    }

    // IN 절용 파라미터 생성 ($1, $2, $3, ...)
    const placeholders = employeeIds.map((_, i) => `$${i + 1}`).join(', ');

    const sql = `
      SELECT 
        edp."employeeId" AS "employeeId",
        edp."departmentId" AS "departmentId",
        d."departmentName" AS "departmentName",
        edp."positionId" AS "positionId",
        p."positionTitle" AS "positionTitle",
        edp."isManager" AS "isManager"
      FROM employee_department_positions edp
      LEFT JOIN "departments-info" d ON edp."departmentId" = d.id
      LEFT JOIN positions p ON edp."positionId" = p.id
      WHERE edp."employeeId" IN (${placeholders})
    `;

    const rows = await this.dataSource.query(sql, employeeIds);

    // employeeId별로 그룹핑
    for (const row of rows) {
      const positions = result.get(row.employeeId) || [];
      positions.push({
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        positionId: row.positionId,
        positionTitle: row.positionTitle,
        isManager: row.isManager,
      });
      result.set(row.employeeId, positions);
    }

    return result;
  }

  /**
   * 승인 가능한 사용자(매니저 이상) 검색
   *
   * Role이 ADMIN 또는 MANAGER인 활성 사용자를 조회합니다.
   * keyword로 이름, 부서명, 이메일, 사번에 대해 OR 조건 ILIKE 검색을 수행합니다.
   */
  async findApprovers(
    keyword: string | undefined,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ApproverItem>> {
    const { page, pageSize } = pagination;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [
      `u.is_active = true`,
      `r.name IN ($1, $2)`,
    ];
    const params: any[] = [RoleNameEnum.ADMIN, RoleNameEnum.MANAGER];
    let paramIndex = 3;

    if (keyword) {
      conditions.push(
        `(e.name ILIKE $${paramIndex} OR e.email ILIKE $${paramIndex} OR e."employeeNumber" ILIKE $${paramIndex} OR d."departmentName" ILIKE $${paramIndex})`,
      );
      params.push(`%${keyword}%`);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 데이터 조회
    const dataSql = `
      SELECT DISTINCT ON (u.id)
        u.id AS "id",
        e.name AS "name",
        e.email AS "email",
        e."employeeNumber" AS "employeeNumber",
        d."departmentName" AS "departmentName",
        p."positionTitle" AS "positionName",
        r.id AS "roleId",
        r.name AS "roleName",
        r.description AS "roleDescription"
      FROM users u
      INNER JOIN "employees-info" e ON u.id = e.id
      INNER JOIN roles r ON u.role_id = r.id
      LEFT JOIN employee_department_positions edp ON e.id = edp."employeeId"
      LEFT JOIN "departments-info" d ON edp."departmentId" = d.id
      LEFT JOIN positions p ON edp."positionId" = p.id
      ${whereClause}
      ORDER BY u.id, e.name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    // 카운트 조회
    const countSql = `
      SELECT COUNT(DISTINCT u.id) AS "totalCount"
      FROM users u
      INNER JOIN "employees-info" e ON u.id = e.id
      INNER JOIN roles r ON u.role_id = r.id
      LEFT JOIN employee_department_positions edp ON e.id = edp."employeeId"
      LEFT JOIN "departments-info" d ON edp."departmentId" = d.id
      LEFT JOIN positions p ON edp."positionId" = p.id
      ${whereClause}
    `;

    const dataParams = [...params, pageSize, offset];
    const countParams = params;

    const [rows, countResult] = await Promise.all([
      this.dataSource.query(dataSql, dataParams),
      this.dataSource.query(countSql, countParams),
    ]);

    const totalItems = parseInt(countResult[0]?.totalCount ?? '0', 10);

    const items: ApproverItem[] = rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      employeeNumber: row.employeeNumber,
      departmentName: row.departmentName,
      positionName: row.positionName,
      role: {
        id: row.roleId,
        name: row.roleName,
        description: row.roleDescription,
      },
    }));

    return createPaginatedResult(items, page, pageSize, totalItems);
  }

  /**
   * 특정 사용자가 승인 가능한 역할(매니저 이상)인지 확인
   */
  async isApprover(userId: string): Promise<boolean> {
    const sql = `
      SELECT 1
      FROM users u
      INNER JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
        AND u.is_active = true
        AND r.name IN ($2, $3)
      LIMIT 1
    `;
    const result = await this.dataSource.query(sql, [
      userId,
      RoleNameEnum.ADMIN,
      RoleNameEnum.MANAGER,
    ]);
    return result.length > 0;
  }
}

/**
 * 승인자 조회 결과 항목
 */
export interface ApproverItem {
  id: string;
  name: string;
  email: string;
  employeeNumber: string;
  departmentName: string | null;
  positionName: string | null;
  role: {
    id: string;
    name: string;
    description: string | null;
  };
}
