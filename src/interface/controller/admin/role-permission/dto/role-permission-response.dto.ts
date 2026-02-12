/**
 * 권한 정보 응답 DTO
 */
export class PermissionResponseDto {
  /** 권한 코드 */
  code: string;
  /** 권한 설명 */
  description: string;
}

/**
 * 역할별 권한 매핑 응답 DTO
 */
export class RolePermissionResponseDto {
  /** 역할 ID (UUID) */
  roleId: string;
  /** 역할 이름 */
  roleName: string;
  /** 역할 설명 */
  roleDescription: string;
  /** 해당 역할의 권한 목록 */
  permissions: PermissionResponseDto[];
}

/**
 * 카테고리별 권한 그룹 응답 DTO
 */
export class PermissionCategoryDto {
  /** 카테고리 이름 */
  category: string;
  /** 해당 카테고리의 권한 목록 */
  permissions: PermissionResponseDto[];
}
