/**
 * 기본 역할(Role) 이름 Enum
 *
 * 시스템 초기화 시 자동 생성되는 역할들
 */
export enum RoleNameEnum {
  /** 관리자 - 모든 권한 */
  ADMIN = 'ADMIN',

  /** 매니저 - 대부분 권한 (관리자 전용 제외) */
  MANAGER = 'MANAGER',

  /** 사용자 - 기본 권한 */
  USER = 'USER',
}

/**
 * 역할별 설명
 */
export const RoleDescriptions: Record<RoleNameEnum, string> = {
  [RoleNameEnum.ADMIN]: '관리자',
  [RoleNameEnum.MANAGER]: '매니저',
  [RoleNameEnum.USER]: '사용자',
};
