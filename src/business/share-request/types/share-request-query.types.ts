/**
 * ShareRequest Query Service 타입 정의
 */

/**
 * 내부 사용자 상세 정보
 */
export interface InternalUserDetail {
  type: 'INTERNAL_USER';
  userId: string;
  name: string;
  email: string;
  department: string;
  position?: string;
}

/**
 * 외부 사용자 상세 정보
 */
export interface ExternalUserDetail {
  type: 'EXTERNAL_USER';
  userId: string;
  name: string;
  email: string;
  company?: string;
  department?: string;
  phone?: string;
}

/**
 * 사용자 상세 정보 (내부 또는 외부)
 */
export type UserDetail = InternalUserDetail | ExternalUserDetail;

/**
 * 공유 항목 결과 (Q-1, Q-2 API 응답)
 */
export interface ShareItemResult {
  source: 'ACTIVE_SHARE' | 'PENDING_REQUEST';
  file: {
    id: string;
    name: string;
    path: string;
    mimeType: string;
  };
  requester: InternalUserDetail;
  target: UserDetail;
  approver?: InternalUserDetail;
  isAutoApproved?: boolean;
  decidedAt?: Date;
  decisionComment?: string;
  reason: string;
  permission: string; // 'VIEW' | 'DOWNLOAD'
  startAt: Date;
  endAt: Date;
  // ACTIVE_SHARE fields
  publicShareId?: string;
  currentViewCount?: number;
  currentDownloadCount?: number;
  isBlocked?: boolean;
  sharedAt?: Date;
  // PENDING_REQUEST fields
  shareRequestId?: string;
  requestedAt?: Date;
}

/**
 * 대상자별 조회 결과 (Q-1 API 응답)
 */
export interface SharesByTargetResult {
  items: ShareItemResult[];
  summary: {
    activeShareCount: number;
    pendingRequestCount: number;
    totalViewCount: number;
    totalDownloadCount: number;
  };
  target: UserDetail;
}

/**
 * 파일별 조회 결과 (Q-2 API 응답)
 */
export interface SharesByFileResult {
  items: ShareItemResult[];
  summary: {
    activeShareCount: number;
    pendingRequestCount: number;
    totalViewCount: number;
    totalDownloadCount: number;
  };
  file: {
    id: string;
    name: string;
    path: string;
    mimeType: string;
  };
}
