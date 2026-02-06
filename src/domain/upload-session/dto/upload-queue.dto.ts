/**
 * 업로드 대기열 (Virtual Queue) DTO
 *
 * Admission Control에서 슬롯이 없을 때 대기열에 등록하고
 * 클라이언트가 폴링으로 자신의 순번을 확인하는 데 사용됩니다.
 */

/**
 * 대기열 티켓 상태
 */
export type QueueTicketStatus = 'WAITING' | 'READY' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

/**
 * initiate 요청 → 즉시 세션 생성 또는 대기열 등록 응답
 *
 * status 필드로 구분하는 Discriminated Union:
 * - status === 'ACTIVE' → 201, sessionId 포함
 * - status === 'WAITING' → 202, queueTicket 포함
 */
export type InitiateOrQueueResponse =
  | InitiateActiveResponse
  | InitiateQueuedResponse;

/**
 * 슬롯 확보 → 즉시 세션 생성 (201)
 */
export interface InitiateActiveResponse {
  status: 'ACTIVE';
  sessionId: string;
  partSize: number;
  totalParts: number;
  expiresAt: string;
}

/**
 * 슬롯 부족 → 대기열 등록 (202)
 */
export interface InitiateQueuedResponse {
  status: 'WAITING';
  queueTicket: string;
  position: number;
  estimatedWaitSeconds: number;
}

/**
 * 대기열 상태 폴링 응답
 */
export type QueueStatusResponse =
  | QueueWaitingResponse
  | QueueReadyResponse
  | QueueExpiredResponse
  | QueueCancelledResponse;

export interface QueueWaitingResponse {
  status: 'WAITING';
  position: number;
  estimatedWaitSeconds: number;
}

export interface QueueReadyResponse {
  status: 'READY';
  sessionId: string;
  partSize: number;
  totalParts: number;
  expiresAt: string;
  /** READY 후 이 시간까지 파트 업로드를 시작하지 않으면 만료됨 */
  claimDeadline: string;
}

export interface QueueExpiredResponse {
  status: 'EXPIRED';
  message: string;
}

export interface QueueCancelledResponse {
  status: 'CANCELLED';
  message: string;
}

/**
 * 전체 대기열 현황 응답
 */
export interface QueueOverallStatusResponse {
  /** 현재 활성 세션 수 */
  activeSessions: number;
  /** 최대 활성 세션 수 */
  maxActiveSessions: number;
  /** 현재 대기 중인 티켓 수 */
  waitingCount: number;
  /** 최대 대기열 크기 */
  maxQueueSize: number;
  /** 활성 세션의 총 업로드 바이트 */
  totalUploadBytes: number;
  /** 최대 허용 총 업로드 바이트 */
  maxTotalUploadBytes: number;
  /** 가용 슬롯 수 */
  availableSlots: number;
}
