/**
 * Department Admin Controller Swagger 데코레이터
 * 컨트롤러를 깔끔하게 유지하기 위해 Swagger 데코레이터를 분리
 */
import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { DepartmentHierarchyResponseDto } from './dto/department-hierarchy-response.dto';

/**
 * GET /v1/admin/departments - 부서 계층 구조 조회 API 문서
 */
export const ApiGetDepartmentHierarchy = () =>
  applyDecorators(
    ApiOperation({
      summary: '부서 계층 구조 조회',
      description: `
departments-info 테이블의 부서 정보를 계층(트리) 구조로 반환합니다.

### 정렬 기준
- \`parentDepartmentId\`로 부모-자식 관계를 구성합니다.
- 각 레벨에서 \`order\` 오름차순 정렬 (0이 가장 위).

### 계층 구조 예시
\`\`\`
루미르 주식회사 (COMPANY, order: 0)
  ├─ 루미르주식회사본사 (DIVISION, order: 0, 90명)
  │   ├─ 대표이사 (DEPARTMENT, order: 0, 90명)
  │   │   ├─ LumirX-1 TF (TEAM, order: 0, 7명)
  │   │   ├─ 경영지원본부 (TEAM, order: 1, 11명)
  │   │   └─ 연구개발본부 (TEAM, order: 2, 64명)
  │   │       ├─ PM실 (TEAM, order: 0, 5명)
  │   │       ├─ 시스템파트 (TEAM, order: 1, 3명)
  │   │       └─ ... (order 순서)
\`\`\`

### 응답 필드
| 필드 | 설명 |
|---|---|
| \`id\` | 부서 ID (UUID) |
| \`departmentName\` | 부서명 |
| \`departmentCode\` | 부서 코드 |
| \`type\` | 부서 유형 (COMPANY, DIVISION, DEPARTMENT, TEAM) |
| \`order\` | 정렬 순서 (낮을수록 상위) |
| \`memberCount\` | 해당 부서에 소속된 인원 수 |
| \`parentDepartmentId\` | 상위 부서 ID (최상위는 null) |
| \`children\` | 하위 부서 목록 (재귀 구조) |
      `,
    }),
    ApiOkResponse({
      description: '부서 계층 구조 반환 (트리 형태)',
      type: [DepartmentHierarchyResponseDto],
    }),
  );
