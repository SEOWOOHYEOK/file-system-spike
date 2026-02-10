import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';
import { UserType, ClientType } from '../../domain/audit/enums/common.enum';
import { detectClientType } from '../utils/device-fingerprint.util';

/**
 * 요청 컨텍스트 데이터
 */
export interface RequestContextData {
  requestId: string;
  sessionId?: string;
  traceId?: string;
  userId?: string;
  userType?: UserType;
  userName?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  startTime: number;
}

/**
 * 감사 로그에 필요한 공통 컨텍스트 정보
 */
export interface AuditContextSnapshot {
  requestId: string;
  sessionId?: string;
  traceId?: string;
  userId?: string;
  userType: UserType;
  userName: string;
  userEmail?: string;
  ipAddress: string;
  userAgent: string;
  clientType: ClientType;
}

/**
 * RequestContext
 *
 * AsyncLocalStorage를 사용하여 요청별 컨텍스트 관리
 * - 요청 ID, 세션 ID, 트레이스 ID 자동 생성
 * - 요청 전체에서 컨텍스트 정보 접근 가능
 */
export class RequestContext {
  private static storage = new AsyncLocalStorage<RequestContextData>();

  /**
   * 새로운 컨텍스트로 실행
   */
  static run<T>(data: Partial<RequestContextData>, fn: () => T): T {
    const contextData: RequestContextData = {
      requestId: data.requestId || uuidv4(),
      sessionId: data.sessionId,
      traceId: data.traceId,
      userId: data.userId,
      userType: data.userType,
      userName: data.userName,
      userEmail: data.userEmail,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      startTime: data.startTime || Date.now(),
    };
    return this.storage.run(contextData, fn);
  }

  /**
   * 현재 컨텍스트 조회
   */
  static get(): RequestContextData | undefined {
    return this.storage.getStore();
  }

  /**
   * 현재 요청 ID 조회
   */
  static getRequestId(): string {
    return this.get()?.requestId || uuidv4();
  }

  /**
   * 현재 세션 ID 조회
   */
  static getSessionId(): string | undefined {
    return this.get()?.sessionId;
  }

  /**
   * 현재 트레이스 ID 조회
   */
  static getTraceId(): string | undefined {
    return this.get()?.traceId;
  }

  /**
   * 현재 사용자 ID 조회
   */
  static getUserId(): string | undefined {
    return this.get()?.userId;
  }

  /**
   * 현재 사용자 타입 조회
   */
  static getUserType(): UserType {
    return this.get()?.userType ?? UserType.INTERNAL;
  }

  /**
   * 현재 사용자 이메일 조회
   */
  static getUserEmail(): string | undefined {
    return this.get()?.userEmail;
  }

  /**
   * 현재 사용자 이름 조회
   */
  static getUserName(): string {
    return this.get()?.userName || 'unknown';
  }

  /**
   * 현재 User-Agent 조회
   */
  static getUserAgent(): string | undefined {
    return this.get()?.userAgent;
  }

  /**
   * 요청 시작 시간 조회
   */
  static getStartTime(): number {
    return this.get()?.startTime || Date.now();
  }

  /**
   * 요청 소요 시간 계산 (ms)
   */
  static getDurationMs(): number {
    return Date.now() - this.getStartTime();
  }

  /**
   * 현재 IP 주소 조회
   */
  static getIpAddress(): string | undefined {
    return this.get()?.ipAddress;
  }

  /**
   * 감사 로그용 컨텍스트 스냅샷 생성
   *
   * AuditLogInterceptor에서 반복 호출하던 개별 getter를
   * 한 번에 묶어서 반환한다.
   */
  static getAuditSnapshot(): AuditContextSnapshot {
    const ctx = this.get();
    const userAgent = ctx?.userAgent || 'unknown';

    return {
      requestId: ctx?.requestId || 'unknown',
      sessionId: ctx?.sessionId,
      traceId: ctx?.traceId,
      userId: ctx?.userId,
      userType: (ctx?.userType as UserType) ?? UserType.INTERNAL,
      userName: ctx?.userName || 'unknown',
      userEmail: ctx?.userEmail,
      ipAddress: ctx?.ipAddress || 'unknown',
      userAgent,
      clientType: detectClientType(userAgent) as ClientType,
    };
  }

  /**
   * 컨텍스트 값 설정
   */
  static set<K extends keyof RequestContextData>(
    key: K,
    value: RequestContextData[K],
  ): void {
    const current = this.get();
    if (current) {
      current[key] = value;
    }
  }

  /**
   * 사용자 정보 설정
   */
  static setUser(user: {
    userId: string;
    userType: UserType;
    userName?: string;
    userEmail?: string;
  }): void {
    const current = this.get();
    if (current) {
      current.userId = user.userId;
      current.userType = user.userType;
      current.userName = user.userName;
      current.userEmail = user.userEmail;
    }
  }

  /**
   * 트레이스 ID 설정 (멀티파트 업로드 등 여러 요청에 걸친 작업)
   */
  static setTraceId(traceId: string): void {
    const current = this.get();
    if (current) {
      current.traceId = traceId;
    }
  }
}
