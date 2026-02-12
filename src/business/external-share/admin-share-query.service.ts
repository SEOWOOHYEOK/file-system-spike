import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  createPaginatedResult,
  type PaginatedResult,
} from '../../common/types/pagination';
import { PublicShare } from '../../domain/external-share/entities/public-share.entity';
import type { SharePermission } from '../../domain/external-share/type/public-share.type';

/**
 * 관리자 공유 필터 조건
 */
export interface AdminShareFilterParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  ownerName?: string;
  ownerDepartment?: string;
  recipientName?: string;
  recipientDepartment?: string;
  fileName?: string;
}

/**
 * 관리자 공유 조회 쿼리 서비스
 *
 * 크로스 도메인 JOIN이 필요한 관리자 공유 목록 조회를 담당
 * - public_shares + files + employees(owner) + departments(owner)
 *   + employees(recipient) + departments(recipient)
 *
 * DDD 관점:
 * - Repository는 단일 Aggregate만 담당
 * - 크로스 도메인 조회 + 필터는 Business Layer의 Query Service에서 처리
 */
@Injectable()
export class AdminShareQueryService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 관리자 전체 공유 현황 조회 (필터링 + 페이지네이션)
   *
   * 공유자/공유받은사람/파일명으로 필터 후 페이지네이션된 결과를 반환합니다.
   * 파일 정보, 소유자 정보, 외부사용자 정보가 모두 채워진 상태로 반환됩니다.
   */
  async findAllWithFilters(
    filter: AdminShareFilterParams,
  ): Promise<PaginatedResult<PublicShare>> {
    const {
      page,
      pageSize,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filter;
    const offset = (page - 1) * pageSize;

    // 동적 WHERE 절 구성
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.ownerName) {
      conditions.push(`owner_emp.name ILIKE $${paramIndex}`);
      params.push(`%${filter.ownerName}%`);
      paramIndex++;
    }

    if (filter.ownerDepartment) {
      conditions.push(`owner_dept."departmentName" ILIKE $${paramIndex}`);
      params.push(`%${filter.ownerDepartment}%`);
      paramIndex++;
    }

    if (filter.recipientName) {
      conditions.push(`ext_emp.name ILIKE $${paramIndex}`);
      params.push(`%${filter.recipientName}%`);
      paramIndex++;
    }

    if (filter.recipientDepartment) {
      conditions.push(`ext_dept."departmentName" ILIKE $${paramIndex}`);
      params.push(`%${filter.recipientDepartment}%`);
      paramIndex++;
    }

    if (filter.fileName) {
      conditions.push(`f.name ILIKE $${paramIndex}`);
      params.push(`%${filter.fileName}%`);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 정렬 필드 매핑 (허용된 필드만)
    const sortFieldMap: Record<string, string> = {
      createdAt: '"createdAt"',
      fileName: '"fileName"',
      ownerName: '"ownerName"',
      recipientName: '"externalUserName"',
      isBlocked: '"isBlocked"',
    };
    const resolvedSortField = sortFieldMap[sortBy] || '"createdAt"';
    const sortDir = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const joinClause = `
      LEFT JOIN files f ON ps.file_id = f.id
      LEFT JOIN "employees-info" owner_emp ON ps.owner_id = owner_emp.id
      LEFT JOIN employee_department_positions owner_edp ON owner_emp.id = owner_edp."employeeId"
      LEFT JOIN "departments-info" owner_dept ON owner_edp."departmentId" = owner_dept.id
      LEFT JOIN "employees-info" ext_emp ON ps.external_user_id = ext_emp.id
      LEFT JOIN employee_department_positions ext_edp ON ext_emp.id = ext_edp."employeeId"
      LEFT JOIN "departments-info" ext_dept ON ext_edp."departmentId" = ext_dept.id
    `;

    // 데이터 조회
    // DISTINCT ON 으로 employee 다중 부서로 인한 중복 제거 후,
    // 외부 쿼리에서 정렬 + 페이지네이션 수행
    const dataSql = `
      SELECT * FROM (
        SELECT DISTINCT ON (ps.id)
          ps.id,
          ps.file_id AS "fileId",
          ps.owner_id AS "ownerId",
          ps.external_user_id AS "externalUserId",
          ps.internal_user_id AS "internalUserId",
          ps.permissions,
          ps.max_view_count AS "maxViewCount",
          ps.current_view_count AS "currentViewCount",
          ps.max_download_count AS "maxDownloadCount",
          ps.current_download_count AS "currentDownloadCount",
          ps.expires_at AS "expiresAt",
          ps.start_at AS "startAt",
          ps.is_blocked AS "isBlocked",
          ps.blocked_at AS "blockedAt",
          ps.blocked_by AS "blockedBy",
          ps.is_revoked AS "isRevoked",
          ps.created_at AS "createdAt",
          ps.updated_at AS "updatedAt",
          f.name AS "fileName",
          f."sizeBytes" AS "fileSize",
          f."mimeType" AS "mimeType",
          f."createdBy" AS "fileCreatedBy",
          owner_emp.name AS "ownerName",
          owner_dept."departmentName" AS "ownerDepartment",
          ext_emp.name AS "externalUserName",
          ext_dept."departmentName" AS "externalUserDepartment"
        FROM public_shares ps
        ${joinClause}
        ${whereClause}
        ORDER BY ps.id
      ) sub
      ORDER BY sub.${resolvedSortField} ${sortDir} NULLS LAST
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    // 카운트 조회 (DISTINCT로 중복 제거)
    const countSql = `
      SELECT COUNT(DISTINCT ps.id) AS "totalCount"
      FROM public_shares ps
      ${joinClause}
      ${whereClause}
    `;

    const dataParams = [...params, pageSize, offset];
    const countParams = params;

    const [rows, countResult] = await Promise.all([
      this.dataSource.query(dataSql, dataParams),
      this.dataSource.query(countSql, countParams),
    ]);

    const totalItems = parseInt(countResult[0]?.totalCount ?? '0', 10);

    const items = rows.map((row: any) => this.mapRowToPublicShare(row));

    return createPaginatedResult(items, page, pageSize, totalItems);
  }

  /**
   * Raw SQL 결과 행을 PublicShare 도메인 엔티티로 변환
   * 파일/소유자/외부사용자 메타데이터가 이미 채워진 상태
   */
  private mapRowToPublicShare(row: any): PublicShare {
    // permissions: TypeORM simple-array 형식 (comma-separated string)
    const permissions: SharePermission[] = row.permissions
      ? typeof row.permissions === 'string'
        ? (row.permissions.split(',') as SharePermission[])
        : (row.permissions as SharePermission[])
      : [];

    return new PublicShare({
      id: row.id,
      fileId: row.fileId,
      ownerId: row.ownerId,
      externalUserId: row.externalUserId,
      internalUserId: row.internalUserId || undefined,
      permissions,
      maxViewCount: row.maxViewCount ?? undefined,
      currentViewCount: row.currentViewCount ?? 0,
      maxDownloadCount: row.maxDownloadCount ?? undefined,
      currentDownloadCount: row.currentDownloadCount ?? 0,
      expiresAt: row.expiresAt ?? undefined,
      startAt: row.startAt ?? undefined,
      isBlocked: row.isBlocked ?? false,
      blockedAt: row.blockedAt ?? undefined,
      blockedBy: row.blockedBy ?? undefined,
      isRevoked: row.isRevoked ?? false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt ?? undefined,
      // 파일 메타데이터
      fileName: row.fileName ?? '',
      fileSize: parseInt(row.fileSize || '0', 10),
      mimeType: row.mimeType ?? '',
      fileCreatedBy: row.fileCreatedBy ?? '',
      // 소유자 메타데이터
      ownerName: row.ownerName ?? '',
      ownerDepartment: row.ownerDepartment ?? '',
      // 외부 사용자 메타데이터
      externalUserName: row.externalUserName ?? '',
      externalUserCompany: row.externalUserDepartment ?? '',
      externalUserDepartment: row.externalUserDepartment ?? '',
    });
  }
}
