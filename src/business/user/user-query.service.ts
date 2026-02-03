import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';


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
}
