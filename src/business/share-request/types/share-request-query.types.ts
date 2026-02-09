/**
 * ShareRequest Query Service 타입 정의
 *
 * Q-1: 대상자별 공유 현황 조회 API
 * Q-2: 파일별 공유 현황 조회 API
 */

/**
 * 내부 사용자 상세 정보
 * - 조직 내부에 등록된 사용자 (직원)
 */
export interface InternalUserDetail {
  /** 사용자 구분 타입 (내부 사용자 고정값) */
  type: 'INTERNAL_USER';
  /** 사용자 고유 ID */
  userId: string;
  /** 사용자 이름 */
  name: string;
  /** 사용자 이메일 주소 */
  email: string;
  /** 소속 부서명 */
  department: string;
  /** 직급/직책 (선택) */
  position?: string;
}

/**
 * 외부 사용자 상세 정보
 * - 외부 공유 대상자 (사외 인원)
 */
export interface ExternalUserDetail {
  /** 사용자 구분 타입 (외부 사용자 고정값) */
  type: 'EXTERNAL_USER';
  /** 사용자 고유 ID */
  userId: string;
  /** 사용자 이름 */
  name: string;
  /** 사용자 이메일 주소 */
  email: string;
  /** 소속 회사명 (선택) */
  company?: string;
  /** 소속 부서명 (선택) */
  department?: string;
  /** 연락처 전화번호 (선택) */
  phone?: string;
}

/**
 * 사용자 상세 정보 (내부 또는 외부)
 * - 내부 사용자와 외부 사용자를 통합한 유니온 타입
 * - type 필드로 구분하여 타입 가드 적용 가능
 */
export type UserDetail = InternalUserDetail | ExternalUserDetail;

/**
 * 공유 항목 결과 (Q-1, Q-2 API 응답)
 * - 활성 공유(ACTIVE_SHARE)와 대기 중 요청(PENDING_REQUEST)을 통합한 단일 구조
 * - source 필드에 따라 일부 필드의 존재 여부가 달라짐
 */
export interface ShareItemResult {
  /** 데이터 출처 구분: 활성 공유 또는 승인 대기 요청 */
  source: 'ACTIVE_SHARE' | 'PENDING_REQUEST';

  /** 공유 대상 파일 정보 */
  file: {
    /** 파일 고유 ID */
    id: string;
    /** 파일명 (확장자 포함) */
    name: string;
    /** 파일 저장 경로 */
    path: string;
    /** 파일 MIME 타입 (예: application/pdf, image/png) */
    mimeType: string;
  };

  /** 공유 요청자 정보 (내부 사용자) */
  requester: InternalUserDetail;
  /** 공유 대상자 정보 (내부 또는 외부 사용자) */
  target: UserDetail;
  /** 승인/반려 처리자 정보 (선택, 결정 완료 시 존재) */
  approver?: InternalUserDetail;
  /** 자동 승인 여부 (선택, 자동 승인 정책 적용 시 true) */
  isAutoApproved?: boolean;
  /** 승인/반려 결정 일시 (선택) */
  decidedAt?: Date;
  /** 승인/반려 시 남긴 코멘트 (선택) */
  decisionComment?: string;
  /** 공유 요청 사유 */
  reason: string;
  /** 공유 권한 수준: 'VIEW'(열람만) | 'DOWNLOAD'(다운로드 허용) */
  permission: string;
  /** 공유 시작 일시 */
  startAt: Date;
  /** 공유 만료 일시 */
  endAt: Date;

  // ── ACTIVE_SHARE 전용 필드 (source === 'ACTIVE_SHARE' 일 때 존재) ──

  /** 공개 공유 링크 고유 ID (선택) */
  publicShareId?: string;
  /** 현재까지 누적 조회 수 (선택) */
  currentViewCount?: number;
  /** 현재까지 누적 다운로드 수 (선택) */
  currentDownloadCount?: number;
  /** 공유 차단 여부 (선택, true이면 관리자에 의해 차단됨) */
  isBlocked?: boolean;
  /** 공유 활성화 일시 (선택) */
  sharedAt?: Date;

  // ── PENDING_REQUEST 전용 필드 (source === 'PENDING_REQUEST' 일 때 존재) ──

  /** 공유 요청 고유 ID (선택) */
  shareRequestId?: string;
  /** 공유 요청 접수 일시 (선택) */
  requestedAt?: Date;
}

/**
 * 대상자별 조회 결과 (Q-1 API 응답)
 * - 특정 대상자에 대한 모든 공유 항목과 요약 통계를 포함
 */
export interface SharesByTargetResult {
  /** 해당 대상자에 대한 공유 항목 목록 */
  items: ShareItemResult[];

  /** 요약 통계 정보 */
  summary: {
    /** 현재 활성 상태인 공유 건수 */
    activeShareCount: number;
    /** 승인 대기 중인 요청 건수 */
    pendingRequestCount: number;
    /** 전체 누적 조회 수 합계 */
    totalViewCount: number;
    /** 전체 누적 다운로드 수 합계 */
    totalDownloadCount: number;
  };

  /** 조회 대상자 정보 */
  target: UserDetail;
}

/**
 * 파일별 조회 결과 (Q-2 API 응답)
 * - 특정 파일에 대한 모든 공유 항목과 요약 통계를 포함
 */
export interface SharesByFileResult {
  /** 해당 파일에 대한 공유 항목 목록 */
  items: ShareItemResult[];

  /** 요약 통계 정보 */
  summary: {
    /** 현재 활성 상태인 공유 건수 */
    activeShareCount: number;
    /** 승인 대기 중인 요청 건수 */
    pendingRequestCount: number;
    /** 전체 누적 조회 수 합계 */
    totalViewCount: number;
    /** 전체 누적 다운로드 수 합계 */
    totalDownloadCount: number;
  };

  /** 조회 대상 파일 정보 */
  file: {
    /** 파일 고유 ID */
    id: string;
    /** 파일명 (확장자 포함) */
    name: string;
    /** 파일 저장 경로 */
    path: string;
    /** 파일 MIME 타입 (예: application/pdf, image/png) */
    mimeType: string;
  };
}
