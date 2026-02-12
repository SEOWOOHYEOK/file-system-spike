import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DepartmentHierarchyResponseDto } from '../../interface/controller/admin/department/dto/department-hierarchy-response.dto';

interface DepartmentRow {
  id: string;
  departmentName: string;
  departmentCode: string;
  type: string;
  parentDepartmentId: string | null;
  order: number;
  memberCount: number;
}

/**
 * 부서 조회 서비스
 *
 * departments-info 테이블에서 부서 정보를 조회하고
 * parentDepartmentId, order를 기반으로 계층 트리를 구성합니다.
 */
@Injectable()
export class DepartmentQueryService {
  private readonly logger = new Logger(DepartmentQueryService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * 부서 계층 구조 조회
   *
   * 1) departments-info 전체 조회 + employee_department_positions에서 인원 수 집계
   * 2) parentDepartmentId 기반 트리 구성
   * 3) 각 레벨에서 order 오름차순 정렬 (0이 가장 위)
   */
  async getDepartmentHierarchy(): Promise<DepartmentHierarchyResponseDto[]> {
    const rows: DepartmentRow[] = await this.dataSource.query(`
      SELECT
        d."id",
        d."departmentName",
        d."departmentCode",
        d."type",
        d."parentDepartmentId",
        d."order",
        COALESCE(mc."memberCount", 0)::int AS "memberCount"
      FROM "departments-info" d
      LEFT JOIN (
        SELECT "departmentId", COUNT(*)::int AS "memberCount"
        FROM "employee_department_positions"
        GROUP BY "departmentId"
      ) mc ON mc."departmentId" = d."id"
      ORDER BY d."order" ASC
    `);

    this.logger.log(`부서 ${rows.length}개 조회 완료, 트리 구성 시작`);

    return this.buildHierarchy(rows);
  }

  /**
   * 플랫 부서 목록 → 계층 트리 변환
   *
   * O(n) 알고리즘:
   * 1) Map으로 모든 부서를 id 기준 인덱싱
   * 2) 각 부서를 부모의 children에 추가
   * 3) 루트 노드(parentDepartmentId가 null)만 반환
   * 4) 각 레벨에서 order 오름차순 정렬 보장
   */
  private buildHierarchy(rows: DepartmentRow[]): DepartmentHierarchyResponseDto[] {
    const map = new Map<string, DepartmentHierarchyResponseDto>();
    const roots: DepartmentHierarchyResponseDto[] = [];

    // 1) 모든 부서를 DTO로 변환하여 Map에 저장
    for (const row of rows) {
      map.set(row.id, {
        id: row.id,
        departmentName: row.departmentName,
        departmentCode: row.departmentCode,
        type: row.type,
        order: row.order,
        memberCount: row.memberCount,
        parentDepartmentId: row.parentDepartmentId,
        children: [],
      });
    }

    // 2) 부모-자식 관계 구성
    for (const row of rows) {
      const node = map.get(row.id)!;

      if (row.parentDepartmentId && map.has(row.parentDepartmentId)) {
        map.get(row.parentDepartmentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // 3) 각 레벨에서 order 오름차순 정렬 (SQL에서 이미 정렬했지만, 안전하게 재정렬)
    this.sortChildrenRecursive(roots);

    return roots;
  }

  /**
   * 재귀적으로 children을 order 오름차순 정렬
   */
  private sortChildrenRecursive(nodes: DepartmentHierarchyResponseDto[]): void {
    nodes.sort((a, b) => a.order - b.order);
    for (const node of nodes) {
      if (node.children.length > 0) {
        this.sortChildrenRecursive(node.children);
      }
    }
  }
}
