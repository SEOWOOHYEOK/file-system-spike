/**
 * 접근 액션 타입
 */
export enum AccessAction {
  VIEW = 'VIEW',
  DOWNLOAD = 'DOWNLOAD',
}

/**
 * ShareAccessLog 도메인 엔티티
 *
 * 외부 사용자의 공유 파일 접근 로그 기록
 * - VIEW/DOWNLOAD 액션별 로그 분리
 * - 성공/실패 및 실패 사유 기록
 * - IP, User-Agent, Device Type 등 상세 정보 추적
 */
export class ShareAccessLog {
  id: string;
  publicShareId: string;
  externalUserId: string;

  action: AccessAction;

  // 상세 정보
  ipAddress: string;
  userAgent: string;
  deviceType: string;

  // 결과
  accessedAt: Date;
  success: boolean;
  failReason?: string;

  constructor(props: Partial<ShareAccessLog>) {
    Object.assign(this, props);
  }

  /**
   * 성공 로그 생성 팩토리 메서드
   */
  static createSuccess(params: {
    publicShareId: string;
    externalUserId: string;
    action: AccessAction;
    ipAddress: string;
    userAgent: string;
    deviceType: string;
  }): ShareAccessLog {
    return new ShareAccessLog({
      ...params,
      accessedAt: new Date(),
      success: true,
    });
  }

  /**
   * 실패 로그 생성 팩토리 메서드
   */
  static createFailure(params: {
    publicShareId: string;
    externalUserId: string;
    action: AccessAction;
    ipAddress: string;
    userAgent: string;
    deviceType: string;
    failReason: string;
  }): ShareAccessLog {
    return new ShareAccessLog({
      ...params,
      accessedAt: new Date(),
      success: false,
    });
  }
}
