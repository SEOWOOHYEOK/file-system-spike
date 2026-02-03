import {
  SecurityEventType,
  Severity,
  SecurityEventDefaultSeverity,
} from '../enums/security-event.enum';
import { UserType, ClientType } from '../enums/common.enum';

/**
 * 보안 로그 상세 정보 인터페이스
 *
 * 이벤트별로 다른 추가 정보를 저장하는 유연한 구조
 * JSONB 컬럼으로 저장되어 확장 가능
 */
export interface SecurityLogDetails {
  // ========== 로그인 관련 ==========
  /** 현재까지의 로그인 시도 횟수 */
  attemptCount?: number;
  /** 계정 잠금 임계값 (이 횟수 초과 시 잠금) */
  lockoutThreshold?: number;
  /** 실패/이벤트 사유 */
  reason?: string;

  // ========== 토큰 관련 ==========
  /** 토큰 타입 (access, refresh) */
  tokenType?: string;
  /** 토큰 고유 ID (jti) */
  tokenId?: string;

  // ========== 권한 관련 ==========
  /** 접근 시도한 리소스 경로 */
  attemptedResource?: string;
  /** 필요한 권한 */
  requiredPermission?: string;
  /** 사용자가 보유한 권한 목록 */
  userPermissions?: string[];

  // ========== 기타 확장 필드 ==========
  /** 추가 커스텀 필드 허용 */
  [key: string]: unknown;
}

/**
 * 보안 로그 생성 파라미터
 *
 * SecurityLog.create() 팩토리 메서드에 전달되는 파라미터
 */
export interface CreateSecurityLogParams {
  // ========== 추적 필드 (Correlation) ==========
  /** HTTP 요청 고유 ID */
  requestId: string;
  /** 세션 ID (있는 경우) */
  sessionId?: string;

  // ========== 이벤트 필드 (Event) ==========
  /** 보안 이벤트 타입 (LOGIN_SUCCESS, LOGIN_FAILURE 등) */
  eventType: SecurityEventType;
  /** 심각도 (미지정 시 이벤트 타입에 따라 자동 결정) */
  severity?: Severity;

  // ========== 주체 필드 (Actor) ==========
  /** 사용자 ID (로그인 실패 시 null 가능) */
  userId?: string;
  /** 사용자 유형 */
  userType?: UserType;
  /** 로그인 시도된 사용자명 (로그인 실패 시 기록) */
  usernameAttempted?: string;

  // ========== 클라이언트 필드 (Client) ==========
  /** 클라이언트 IP 주소 */
  ipAddress: string;
  /** HTTP User-Agent 헤더 */
  userAgent: string;
  /** 디바이스 핑거프린트 */
  
  /** 클라이언트 타입 */
  clientType?: ClientType;

  // ========== 상세 정보 (Details) ==========
  /** 이벤트별 추가 상세 정보 (JSONB) */
  details?: SecurityLogDetails;
}

/**
 * SecurityLog 도메인 엔티티
 *
 * 인증, 토큰, 계정, 접근 관련 보안 이벤트 기록
 *
 * 주요 기록 대상:
 * - 로그인 성공/실패
 * - 토큰 발급/만료/무효화
 * - 권한 거부
 * - 이상 행위 감지
 * - 계정 잠금/해제
 *
 * 활용 예시:
 * - 브루트포스 공격 탐지 (IP별 로그인 실패 추적)
 * - 계정 탈취 시도 감지 (사용자별 로그인 실패 패턴)
 * - 권한 상승 시도 감지 (권한 거부 패턴 분석)
 */
export class SecurityLog {
  // ========== 기본 필드 ==========
  /** 로그 고유 ID (UUID) */
  id: string;

  // ========== 추적 필드 (Correlation) ==========
  /**
   * HTTP 요청 고유 ID
   * - 단일 HTTP 요청을 식별
   */
  requestId: string;

  /**
   * 세션 ID
   * - 사용자의 로그인 세션 식별
   * - 로그인 전에는 없을 수 있음
   */
  sessionId?: string;

  // ========== 이벤트 필드 (Event) ==========
  /**
   * 보안 이벤트 타입
   * - LOGIN_SUCCESS: 로그인 성공
   * - LOGIN_FAILURE: 로그인 실패
   * - TOKEN_ISSUED: 토큰 발급
   * - PERMISSION_DENIED: 권한 거부
   * - 등등 (SecurityEventType enum 참조)
   */
  eventType: SecurityEventType;

  /**
   * 이벤트 심각도
   * - INFO: 정보성 (관찰만)
   * - WARN: 경고 (주의 필요)
   * - HIGH: 높음 (즉시 확인 필요)
   * - CRITICAL: 심각 (즉시 대응 필요)
   */
  severity: Severity;

  // ========== 주체 필드 (Actor) ==========
  /**
   * 사용자 ID
   * - 로그인 실패 시에는 null일 수 있음
   * - 인증된 사용자의 행위인 경우 필수
   */
  userId?: string;

  /**
   * 사용자 유형
   * - INTERNAL: 내부 사용자
   * - EXTERNAL: 외부 사용자
   */
  userType?: UserType;

  /**
   * 로그인 시도된 사용자명
   * - 로그인 실패 시 입력된 사용자명 기록
   * - 존재하지 않는 사용자명으로 시도한 경우도 기록
   * - 브루트포스 공격 분석에 활용
   */
  usernameAttempted?: string;

  // ========== 클라이언트 필드 (Client) ==========
  /**
   * 클라이언트 IP 주소
   * - IPv4 또는 IPv6 형식
   * - 공격 출처 추적에 활용
   */
  ipAddress: string;

  /**
   * HTTP User-Agent 헤더
   * - 브라우저/OS/디바이스 정보
   */
  userAgent: string;

  /**
   * 클라이언트 타입
   * - web / mobile / api / unknown
   */
  clientType: ClientType;

  // ========== 상세 정보 (Details) ==========
  /**
   * 이벤트별 추가 상세 정보
   * - JSONB로 유연하게 저장
   * - 이벤트 타입에 따라 다른 정보 포함
   *
   * 예시:
   * - LOGIN_FAILURE: { attemptCount: 3, reason: "INVALID_PASSWORD" }
   * - PERMISSION_DENIED: { attemptedResource: "/api/admin", requiredPermission: "admin:read" }
   */
  details?: SecurityLogDetails;

  // ========== 시간 필드 (Time) ==========
  /**
   * 이벤트 발생 시각
   * - ISO 8601 형식, 밀리초 포함
   */
  createdAt: Date;

  private constructor(props: Partial<SecurityLog>) {
    Object.assign(this, props);
  }

  /**
   * 보안 로그 생성 팩토리 메서드
   *
   * @param params - 로그 생성에 필요한 파라미터
   * @returns 새로운 SecurityLog 인스턴스
   */
  static create(params: CreateSecurityLogParams): SecurityLog {
    return new SecurityLog({
      requestId: params.requestId,
      sessionId: params.sessionId,
      eventType: params.eventType,
      severity:
        params.severity || SecurityEventDefaultSeverity[params.eventType],
      userId: params.userId,
      userType: params.userType,
      usernameAttempted: params.usernameAttempted,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      
      clientType: params.clientType || ClientType.UNKNOWN,
      details: params.details,
      createdAt: new Date(),
    });
  }

  /**
   * 로그인 성공 로그 생성 헬퍼
   *
   * @param params - 로그인 성공 정보
   * @returns LOGIN_SUCCESS 타입의 SecurityLog
   */
  static createLoginSuccess(params: {
    /** HTTP 요청 ID */
    requestId: string;
    /** 세션 ID */
    sessionId?: string;
    /** 로그인한 사용자 ID */
    userId: string;
    /** 사용자 유형 */
    userType: UserType;
    /** 클라이언트 IP */
    ipAddress: string;
    /** User-Agent */
    userAgent: string;
    /** 디바이스 핑거프린트 */
    
  }): SecurityLog {
    return SecurityLog.create({
      ...params,
      eventType: SecurityEventType.LOGIN_SUCCESS,
    });
  }

  /**
   * 로그인 실패 로그 생성 헬퍼
   *
   * @param params - 로그인 실패 정보
   * @returns LOGIN_FAILURE 타입의 SecurityLog
   */
  static createLoginFailure(params: {
    /** HTTP 요청 ID */
    requestId: string;
    /** 로그인 시도된 사용자명 */
    usernameAttempted: string;
    /** 클라이언트 IP */
    ipAddress: string;
    /** User-Agent */
    userAgent: string;
    /** 디바이스 핑거프린트 */
    
    /** 현재까지 시도 횟수 */
    attemptCount: number;
    /** 실패 사유 (INVALID_PASSWORD, USER_NOT_FOUND 등) */
    reason: string;
  }): SecurityLog {
    return SecurityLog.create({
      requestId: params.requestId,
      eventType: SecurityEventType.LOGIN_FAILURE,
      usernameAttempted: params.usernameAttempted,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      
      details: {
        attemptCount: params.attemptCount,
        reason: params.reason,
      },
    });
  }

  /**
   * 권한 거부 로그 생성 헬퍼
   *
   * @param params - 권한 거부 정보
   * @returns PERMISSION_DENIED 타입의 SecurityLog
   */
  static createPermissionDenied(params: {
    /** HTTP 요청 ID */
    requestId: string;
    /** 세션 ID */
    sessionId?: string;
    /** 사용자 ID */
    userId: string;
    /** 사용자 유형 */
    userType: UserType;
    /** 클라이언트 IP */
    ipAddress: string;
    /** User-Agent */
    userAgent: string;
    /** 접근 시도한 리소스 경로 */
    attemptedResource: string;
    /** 필요했던 권한 */
    requiredPermission: string;
  }): SecurityLog {
    return SecurityLog.create({
      ...params,
      eventType: SecurityEventType.PERMISSION_DENIED,
      details: {
        attemptedResource: params.attemptedResource,
        requiredPermission: params.requiredPermission,
      },
    });
  }

  /**
   * 재구성 (DB에서 로드 시)
   *
   * @param props - DB에서 조회한 데이터 (id 필수)
   * @returns 재구성된 SecurityLog 인스턴스
   */
  static reconstitute(props: Partial<SecurityLog> & { id: string }): SecurityLog {
    return new SecurityLog(props);
  }
}
