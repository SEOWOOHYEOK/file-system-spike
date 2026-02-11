import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import { createPaginationInfo } from '../../common/types/pagination';
import type { ShareTargetUserQueryDto } from '../../interface/controller/share/dto/share-target-user.dto';
import {
  ShareTargetUserDto,
  ShareTargetUserType,
} from '../../interface/controller/share/dto/share-target-user.dto';
import type { PaginatedResponseDto } from '../../interface/common/dto/pagination.dto';

/**
 * 공유 대상자 통합 조회 서비스
 *
 * 내부/외부 사용자를 단일 쿼리로 조회하여 통합된 목록을 반환합니다.
 * - 내부 사용자: EXTERNAL_DEPARTMENT_ID 부서에 속하지 않은 직원
 * - 외부 사용자: EXTERNAL_DEPARTMENT_ID 부서에 속한 직원
 * - type 필터로 한쪽만 조회 가능 (불필요한 조회 제거)
 */
@Injectable()
export class ShareTargetUserQueryService {
  private readonly logger = new Logger(ShareTargetUserQueryService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  private getExternalDepartmentId(): string {
    const id = this.configService.get<string>('EXTERNAL_DEPARTMENT_ID');
    if (!id) {
      this.logger.error('EXTERNAL_DEPARTMENT_ID 환경변수가 설정되지 않았습니다.');
      throw BusinessException.of(ErrorCodes.AUTH_CONFIG_ERROR);
    }
    return id;
  }

  /**
   * 공유 대상자 통합 조회 (내부 + 외부)
   *
   * 필터링: type, name, department, email
   * 페이지네이션: page, pageSize
   */
  async findAll(
    query: ShareTargetUserQueryDto,
  ): Promise<PaginatedResponseDto<ShareTargetUserDto>> {
    const externalDeptId = this.getExternalDepartmentId();
    const { page, pageSize } = query;

    // 동적 WHERE 절 구성
    const conditions: string[] = ['e.status = \'재직중\''];
    const params: any[] = [];
    let paramIndex = 1;

    // EXTERNAL_DEPARTMENT_ID 파라미터 (type 판별용)
    params.push(externalDeptId);
    const externalDeptParamIndex = paramIndex;
    paramIndex++;

    // type 필터
    if (query.type === ShareTargetUserType.EXTERNAL) {
      conditions.push(`edp."departmentId" = $${externalDeptParamIndex}`);
    } else if (query.type === ShareTargetUserType.INTERNAL) {
      conditions.push(`edp."departmentId" != $${externalDeptParamIndex}`);
    }

    // name 필터
    if (query.name) {
      conditions.push(`e.name ILIKE $${paramIndex}`);
      params.push(`%${query.name}%`);
      paramIndex++;
    }

    // department 필터
    if (query.department) {
      conditions.push(`d."departmentName" ILIKE $${paramIndex}`);
      params.push(`%${query.department}%`);
      paramIndex++;
    }

    // email 필터
    if (query.email) {
      conditions.push(`e.email ILIKE $${paramIndex}`);
      params.push(`%${query.email}%`);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // COUNT 쿼리
    const countSql = `
      SELECT COUNT(*) AS total
      FROM "employees-info" e
      JOIN employee_department_positions edp ON e.id = edp."employeeId"
      LEFT JOIN "departments-info" d ON edp."departmentId" = d.id
      ${whereClause}
    `;

    const [{ total }] = await this.dataSource.query(countSql, params);
    const totalItems = parseInt(total, 10);

    if (totalItems === 0) {
      const info = createPaginationInfo(page, pageSize, 0);
      return {
        items: [],
        ...info,
      } as PaginatedResponseDto<ShareTargetUserDto>;
    }

    // 데이터 쿼리
    const dataSql = `
      SELECT 
        e.id,
        e.name,
        COALESCE(e.email, '') AS email,
        COALESCE(d."departmentName", '') AS department,
        r.name AS "roleName",
        CASE 
          WHEN edp."departmentId" = $${externalDeptParamIndex} THEN 'EXTERNAL'
          ELSE 'INTERNAL'
        END AS type,
        COALESCE(u.is_active, true) AS "isActive"
      FROM "employees-info" e
      JOIN employee_department_positions edp ON e.id = edp."employeeId"
      LEFT JOIN "departments-info" d ON edp."departmentId" = d.id
      LEFT JOIN users u ON e.id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      ${whereClause}
      ORDER BY e.name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(pageSize);
    params.push((page - 1) * pageSize);

    const rows = await this.dataSource.query(dataSql, params);

    const items: ShareTargetUserDto[] = rows.map((row: any) => {
      const dto = new ShareTargetUserDto();
      dto.id = row.id;
      dto.type = row.type as ShareTargetUserType;
      dto.name = row.name;
      dto.email = row.email;
      dto.department = row.department;
      dto.roleName = row.roleName ?? null;
      dto.isActive = row.isActive;
      return dto;
    });

    const info = createPaginationInfo(page, pageSize, totalItems);
    return {
      items,
      ...info,
    } as PaginatedResponseDto<ShareTargetUserDto>;
  }
}
