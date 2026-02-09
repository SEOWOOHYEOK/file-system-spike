import { UserType } from '../../domain/audit/enums/common.enum';

/**
 * 인증된 사용자 정보 인터페이스
 *
 * Guard에서 JWT 검증 후 DB 조회를 통해 생성되며,
 * request.user와 RequestContext에 설정됩니다.
 *
 * 내부/외부 사용자 공통 타입으로, Guard → Interceptor → Controller 전 구간에서 사용됩니다.
 */
export interface AuthenticatedUser {
  /** 사용자 고유 ID (UUID) */
  id: string;

  /** 사용자 유형 (INTERNAL: 내부 직원, EXTERNAL: 외부 사용자) */
  type: UserType;

  /** 사용자 이름 (내부: employee.name, 외부: externalUser.name) */
  name: string;

  /** 이메일 주소 */
  email: string;

  /** 계정 활성 상태 */
  isActive: boolean;

  // --- Internal 전용 ---

  /** 사번 (내부 사용자만 존재) */
  employeeNumber?: string;

  // --- External 전용 ---

  /** 로그인 아이디 (외부 사용자만 존재) */
  username?: string;

  /** 소속 회사 (외부 사용자만 존재) */
  company?: string;
}
