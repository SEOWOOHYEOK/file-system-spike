import {
  AuditAction,
  AuditActionCategory,
  ActionCategory,
} from '../enums/audit-action.enum';
import {
  UserType,
  TargetType,
  LogResult,
  ClientType,
  Sensitivity,
} from '../enums/common.enum';

/**
 * 감사 로그 메타데이터 인터페이스
 *
 * 액션별로 다른 추가 정보를 저장하는 유연한 구조
 * JSONB 컬럼으로 저장되어 확장 가능
 */
export interface AuditLogMetadata {
  // ========== 파일 관련 ==========
  /** 파일 크기 (bytes) */
  fileSize?: number;
  /** 파일 MIME 타입 (예: application/pdf) */
  mimeType?: string;
  /** 파일 체크섬 (SHA-256) */
  checksum?: string;

  // ========== 공유 관련 ==========
  /** 공유 타입 (public, private, restricted) */
  shareType?: string;
  /** 공유 링크 만료 시간 */
  expiresAt?: Date;
  /** 공유 시 부여된 권한 목록 */
  permissions?: string[];
  /** 최대 접근 횟수 제한 */
  maxAccessCount?: number;

  // ========== 권한 관련 ==========
  /** 변경 전 권한 목록 */
  previousPermissions?: string[];
  /** 변경 후 권한 목록 */
  newPermissions?: string[];
  /** 권한 변경 사유 */
  changeReason?: string;

  // ========== 기타 확장 필드 ==========
  /** 추가 커스텀 필드 허용 */
  [key: string]: unknown;
}

/**
 * 감사 로그 생성 파라미터
 *
 * AuditLog.create() 팩토리 메서드에 전달되는 파라미터
 */
export interface CreateAuditLogParams {
  // ========== 추적 필드 (Correlation) ==========
  /** HTTP 요청 고유 ID - 단일 요청 추적 */
  requestId: string;
  /** 세션 ID - 사용자 세션 전체 추적 */
  sessionId?: string;
  /** 트레이스 ID - 여러 요청에 걸친 작업 추적 (예: 멀티파트 업로드) */
  traceId?: string;

  // ========== 주체 필드 (Actor) ==========
  /** 행위자 사용자 ID */
  userId: string;
  /** 사용자 유형 - INTERNAL(내부) / EXTERNAL(외부) */
  userType: UserType;
  /** 사용자 이름 (비정규화, 조회 성능용) */
  userName?: string;
  /** 사용자 이메일 (비정규화) */
  userEmail?: string;

  // ========== 행위 필드 (Action) ==========
  /** 수행한 행위 코드 (예: FILE_DOWNLOAD, FOLDER_CREATE) */
  action: AuditAction;

  // ========== 대상 필드 (Target) ==========
  /** 대상 타입 - file / folder / share / user */
  targetType: TargetType;
  /** 대상 리소스 ID */
  targetId: string;
  /** 대상 이름 (비정규화, 삭제되어도 유지) */
  targetName?: string;
  /** 대상 경로 (예: /documents/reports/2024/) */
  targetPath?: string;
  /** 기밀 등급 - PUBLIC / INTERNAL / CONFIDENTIAL */
  sensitivity?: Sensitivity;
  /** 대상 리소스 소유자 ID */
  ownerId?: string;

  // ========== 클라이언트 필드 (Client) ==========
  /** 클라이언트 IP 주소 (IPv4/IPv6) */
  ipAddress: string;
  /** HTTP User-Agent 헤더 전체 */
  userAgent: string;
  
  /** 클라이언트 타입 - web / mobile / api / unknown */
  clientType?: ClientType;

  // ========== 결과 필드 (Result) ==========
  /** 행위 결과 - SUCCESS / FAIL */
  result: LogResult;
  /** 상세 결과 코드 (예: 404, PERMISSION_DENIED) */
  resultCode?: string;
  /** 실패 사유 (result가 FAIL인 경우) */
  failReason?: string;
  /** 처리 소요 시간 (밀리초) */
  durationMs?: number;

  // ========== 확장 필드 (Extension) ==========
  /** 액션별 추가 메타데이터 (JSONB) */
  metadata?: AuditLogMetadata;
  /** 검색/분류용 태그 배열 */
  tags?: string[];
}

/**
 * AuditLog 도메인 엔티티
 *
 * 사용자의 모든 행위를 기록하는 감사 로그
 *
 * 설계 원칙:
 * - 풍부한 컨텍스트로 "미래의 질문"에 답할 수 있음
 * - 비정규화로 JOIN 없이 조회 가능 (조회 성능 최적화)
 * - append-only (UPDATE/DELETE 금지, 무결성 보장)
 *
 * 활용 예시:
 * - "이 사용자가 지난 3개월간 어떤 파일에 접근했나?"
 * - "이 파일을 누가 언제 다운로드했나?"
 * - "권한 변경 후 어떤 행위가 있었나?"
 * - "이 IP에서 어떤 계정들이 접속했나?"
 */
export class AuditLog {
  // ========== 기본 필드 ==========
  /** 로그 고유 ID (UUID) */
  id: string;

  // ========== 추적 필드 (Correlation) ==========
  /**
   * HTTP 요청 고유 ID
   * - 단일 HTTP 요청을 식별
   * - 요청-응답 전체 흐름 추적에 사용
   */
  requestId: string;

  /**
   * 세션 ID
   * - 사용자의 로그인 세션 식별
   * - 세션 내 모든 활동 추적 가능
   */
  sessionId?: string;

  /**
   * 트레이스 ID
   * - 여러 HTTP 요청에 걸친 작업 추적
   * - 예: 멀티파트 업로드의 initiate → upload parts → complete
   */
  traceId?: string;

  // ========== 주체 필드 (Actor) - 비정규화 ==========
  /**
   * 행위자 사용자 ID
   * - 행위를 수행한 사용자의 고유 ID
   */
  userId: string;

  /**
   * 사용자 유형
   * - INTERNAL: 내부 직원/사용자
   * - EXTERNAL: 외부 공유 링크 접근자
   */
  userType: UserType;

  /**
   * 사용자 이름 (비정규화)
   * - 조회 시 JOIN 없이 바로 표시 가능
   * - 사용자 삭제 후에도 로그에서 확인 가능
   */
  userName?: string;

  /**
   * 사용자 이메일 (비정규화)
   * - 조회 시 바로 확인 가능
   */
  userEmail?: string;

  // ========== 행위 필드 (Action) ==========
  /**
   * 수행한 행위 코드
   * - FILE_VIEW, FILE_DOWNLOAD, FILE_UPLOAD 등
   * - AuditAction enum 참조
   */
  action: AuditAction;

  /**
   * 행위 카테고리
   * - file, folder, share, auth, admin
   * - action에 따라 자동 매핑
   */
  actionCategory: ActionCategory;

  // ========== 대상 필드 (Target) - 비정규화 ==========
  /**
   * 대상 리소스 타입
   * - file: 파일
   * - folder: 폴더
   * - share: 공유 링크
   * - user: 사용자
   */
  targetType: TargetType;

  /**
   * 대상 리소스 ID
   * - 행위의 대상이 되는 리소스의 고유 ID
   */
  targetId: string;

  /**
   * 대상 이름 (비정규화)
   * - 조회 시 바로 표시 가능
   * - 리소스 삭제 후에도 로그에서 확인 가능
   */
  targetName?: string;

  /**
   * 대상 경로
   * - 파일/폴더의 전체 경로
   * - 예: /documents/reports/2024/Q1/report.pdf
   */
  targetPath?: string;

  /**
   * 기밀 등급
   * - PUBLIC: 공개
   * - INTERNAL: 내부용
   * - CONFIDENTIAL: 기밀
   */
  sensitivity?: Sensitivity;

  /**
   * 대상 리소스 소유자 ID
   * - 해당 파일/폴더의 소유자
   */
  ownerId?: string;

  // ========== 클라이언트 필드 (Client) ==========
  /**
   * 클라이언트 IP 주소
   * - IPv4 또는 IPv6 형식
   * - X-Forwarded-For 헤더 고려
   */
  ipAddress: string;

  /**
   * HTTP User-Agent 헤더
   * - 브라우저/OS/디바이스 정보 포함
   * - 원본 문자열 전체 저장
   */
  userAgent: string;

  /**
   * 디바이스 핑거프린트
   * - IP + User-Agent 기반 SHA-256 해시
   * - 새 디바이스 감지, 이상 접근 탐지에 활용
   */
  

  /**
   * 클라이언트 타입
   * - web: 웹 브라우저
   * - mobile: 모바일 앱
   * - api: API 클라이언트 (curl, Postman 등)
   * - unknown: 식별 불가
   */
  clientType: ClientType;

  // ========== 결과 필드 (Result) ==========
  /**
   * 행위 결과
   * - SUCCESS: 성공
   * - FAIL: 실패
   */
  result: LogResult;

  /**
   * 상세 결과 코드
   * - HTTP 상태 코드 또는 애플리케이션 에러 코드
   * - 예: 404, PERMISSION_DENIED, FILE_NOT_FOUND
   */
  resultCode?: string;

  /**
   * 실패 사유
   * - result가 FAIL인 경우 상세 사유
   * - 보안 분석의 핵심 데이터 (공격 시도는 대부분 실패로 나타남)
   */
  failReason?: string;

  /**
   * 처리 소요 시간 (밀리초)
   * - 요청 시작부터 완료까지 시간
   * - 성능 분석에 활용
   */
  durationMs?: number;

  // ========== 확장 필드 (Extension) ==========
  /**
   * 액션별 추가 메타데이터
   * - JSONB 컬럼으로 유연한 확장 가능
   * - 파일 크기, MIME 타입, 권한 변경 내역 등
   */
  metadata?: AuditLogMetadata;

  /**
   * 검색/분류용 태그
   * - 커스텀 태그 배열
   * - 예: ['sensitive', 'bulk-download', 'external-access']
   */
  tags?: string[];

  // ========== 시간 필드 (Time) ==========
  /**
   * 이벤트 발생 시각
   * - ISO 8601 형식, 밀리초 포함
   * - 타임존: UTC
   */
  createdAt: Date;

  private constructor(props: Partial<AuditLog>) {
    Object.assign(this, props);
  }

  /**
   * 감사 로그 생성 팩토리 메서드
   *
   * @param params - 로그 생성에 필요한 파라미터
   * @returns 새로운 AuditLog 인스턴스
   */
  static create(params: CreateAuditLogParams): AuditLog {
    return new AuditLog({
      requestId: params.requestId,
      sessionId: params.sessionId,
      traceId: params.traceId,
      userId: params.userId,
      userType: params.userType,
      userName: params.userName,
      userEmail: params.userEmail,
      action: params.action,
      actionCategory: AuditActionCategory[params.action],
      targetType: params.targetType,
      targetId: params.targetId,
      targetName: params.targetName,
      targetPath: params.targetPath,
      sensitivity: params.sensitivity,
      ownerId: params.ownerId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      
      clientType: params.clientType || ClientType.UNKNOWN,
      result: params.result,
      resultCode: params.resultCode,
      failReason: params.failReason,
      durationMs: params.durationMs,
      metadata: params.metadata,
      tags: params.tags,
      createdAt: new Date(),
    });
  }

  /**
   * 성공 로그 생성 헬퍼
   *
   * @param params - result, failReason 제외한 파라미터
   * @returns result가 SUCCESS인 AuditLog
   */
  static createSuccess(
    params: Omit<CreateAuditLogParams, 'result' | 'failReason'>,
  ): AuditLog {
    return AuditLog.create({
      ...params,
      result: LogResult.SUCCESS,
    });
  }

  /**
   * 실패 로그 생성 헬퍼
   *
   * @param params - result 제외, failReason 필수인 파라미터
   * @returns result가 FAIL인 AuditLog
   */
  static createFailure(
    params: Omit<CreateAuditLogParams, 'result'> & { failReason: string },
  ): AuditLog {
    return AuditLog.create({
      ...params,
      result: LogResult.FAIL,
    });
  }

  /**
   * 재구성 (DB에서 로드 시)
   *
   * @param props - DB에서 조회한 데이터 (id 필수)
   * @returns 재구성된 AuditLog 인스턴스
   */
  static reconstitute(props: Partial<AuditLog> & { id: string }): AuditLog {
    return new AuditLog(props);
  }
}
