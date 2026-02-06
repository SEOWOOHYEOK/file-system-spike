/**
 * 업로드 대기열 (Virtual Queue) 서비스
 *
 * Admission Control + Virtual Queue를 제공합니다.
 *
 * 역할:
 * - 활성 세션 수/용량/사용자별 제한 체크
 * - 대기열 관리 (티켓 생성, 순서 관리, 승격)
 * - 대기열 상태 조회
 *
 * 데이터 저장: 인메모리 Map + 정렬된 배열
 * - 대기열은 일시적 데이터이므로 DB 불필요
 * - 서버 재시작 시 대기열 소실 (세션 자체는 DB에 남아있어 안전)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';

import { UploadSessionDomainService } from '../../domain/upload-session/service/upload-session-domain.service';
import { MultipartUploadService } from './multipart-upload.service';
import type { InitiateMultipartRequest } from '../../domain/upload-session/dto/initiate-multipart.dto';
import type {
  QueueTicketStatus,
  InitiateOrQueueResponse,
  QueueStatusResponse,
  QueueOverallStatusResponse,
} from '../../domain/upload-session/dto/upload-queue.dto';

// ============================================
// 내부 타입
// ============================================

interface QueueTicket {
  ticketId: string;
  userId: string;
  status: QueueTicketStatus;
  /** initiate 요청 원본 보존 (승격 시 사용) */
  request: InitiateMultipartRequest;
  /** READY 승격 시 생성된 세션 ID */
  sessionId?: string;
  /** 세션 관련 메타 (READY 시 채워짐) */
  partSize?: number;
  totalParts?: number;
  expiresAt?: string;
  /** READY 승격 시각 */
  readyAt?: Date;
  /** 메타 */
  createdAt: Date;
  ticketExpiresAt: Date;
}

@Injectable()
export class UploadQueueService {
  private readonly logger = new Logger(UploadQueueService.name);

  /** ticketId → QueueTicket */
  private readonly ticketMap = new Map<string, QueueTicket>();

  /** WAITING 상태 티켓 ID 순서 배열 */
  private readonly waitingOrder: string[] = [];

  /** userId → 활성 ticketId Set (WAITING | READY | ACTIVE) */
  private readonly userTickets = new Map<string, Set<string>>();

  // ============================================
  // 설정값 (ConfigService에서 로드)
  // ⚠️ .env에 수식(예: 20 * 1024) 사용 불가 - 반드시 정수값만 사용
  // ============================================

  /** 글로벌 동시 활성 세션 수 */
  private readonly MAX_ACTIVE_SESSIONS: number;
  /** 사용자별 동시 세션 수 */
  private readonly MAX_SESSIONS_PER_USER: number;
  /** 모든 활성 세션 totalSize 합계 상한 (bytes) */
  private readonly MAX_TOTAL_UPLOAD_BYTES: number;
  /** 단일 파일 최대 크기 (bytes) */
  private readonly MAX_FILE_SIZE_BYTES: number;
  /** 대기열 티켓 TTL (ms) */
  private readonly QUEUE_TICKET_TTL_MS: number;
  /** READY 상태 미사용 시 만료 (ms) */
  private readonly QUEUE_READY_CLAIM_MS: number;
  /** 최대 대기열 크기 */
  private readonly MAX_QUEUE_SIZE: number;
  /** 예상 세션 소요 시간 (초) */
  private readonly ESTIMATED_SESSION_DURATION_SECONDS: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly uploadSessionDomainService: UploadSessionDomainService,
    private readonly multipartUploadService: MultipartUploadService,
  ) {
    // ConfigService를 통해 .env 값을 안전하게 로드 (모듈 초기화 이후 실행)
    this.MAX_ACTIVE_SESSIONS = this.configService.get<number>('MAX_ACTIVE_SESSIONS', 10);
    this.MAX_SESSIONS_PER_USER = this.configService.get<number>('MAX_SESSIONS_PER_USER', 3);
    this.MAX_TOTAL_UPLOAD_BYTES = this.configService.get<number>('MAX_TOTAL_UPLOAD_BYTES', 50 * 1024 * 1024 * 1024);
    this.MAX_FILE_SIZE_BYTES = this.configService.get<number>('MAX_FILE_SIZE_BYTES', 20 * 1024 * 1024 * 1024);
    this.QUEUE_TICKET_TTL_MS = this.configService.get<number>('QUEUE_TICKET_TTL_MS', 30 * 60 * 1000);
    this.QUEUE_READY_CLAIM_MS = this.configService.get<number>('QUEUE_READY_CLAIM_MS', 5 * 60 * 1000);
    this.MAX_QUEUE_SIZE = this.configService.get<number>('MAX_QUEUE_SIZE', 50);
    this.ESTIMATED_SESSION_DURATION_SECONDS = this.configService.get<number>('ESTIMATED_SESSION_DURATION_SECONDS', 300);

    this.logger.log(
      `업로드 대기열 설정 로드: ` +
      `MAX_ACTIVE_SESSIONS=${this.MAX_ACTIVE_SESSIONS}, ` +
      `MAX_SESSIONS_PER_USER=${this.MAX_SESSIONS_PER_USER}, ` +
      `MAX_TOTAL_UPLOAD_BYTES=${this.MAX_TOTAL_UPLOAD_BYTES} (${this.formatBytes(this.MAX_TOTAL_UPLOAD_BYTES)}), ` +
      `MAX_FILE_SIZE_BYTES=${this.MAX_FILE_SIZE_BYTES} (${this.formatBytes(this.MAX_FILE_SIZE_BYTES)})`,
    );
  }

  /**
   * 바이트를 읽기 쉬운 형식으로 변환
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
  }

  // ============================================
  // 공개 API
  // ============================================

  /**
   * initiate 요청 → 슬롯 확인 후 세션 생성 또는 대기열 등록
   */
  async tryInitiateOrEnqueue(
    request: InitiateMultipartRequest,
    userId: string,
  ): Promise<InitiateOrQueueResponse> {
    // 0. 단일 파일 크기 제한
    if (request.totalSize > this.MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `파일 크기(${request.totalSize} bytes)가 최대 허용 크기(${this.MAX_FILE_SIZE_BYTES} bytes)를 초과합니다.`,
      );
    }

    // 1. 사용자별 세션 수 제한 확인
    const userActiveCount = this.getUserActiveTicketCount(userId);
    if (userActiveCount >= this.MAX_SESSIONS_PER_USER) {
      // 사용자별 제한 초과 시 대기열에 넣지 않고 바로 거부하는 대신 대기열에 등록
      return this.enqueue(request, userId);
    }

    // 2. 글로벌 용량 확인
    const canAdmit = await this.checkCapacity(request.totalSize);
    if (canAdmit) {
      // 즉시 세션 생성
      return this.createSessionImmediately(request, userId);
    }

    // 3. 슬롯 없음 → 대기열 등록
    return this.enqueue(request, userId);
  }

  /**
   * 대기열 상태 조회 (폴링용, lazy 승격 포함)
   */
  async getQueueStatus(ticketId: string): Promise<QueueStatusResponse> {
    const ticket = this.ticketMap.get(ticketId);
    if (!ticket) {
      return { status: 'EXPIRED', message: '티켓을 찾을 수 없거나 만료되었습니다.' };
    }

    // 티켓 TTL 초과 확인
    if (new Date() > ticket.ticketExpiresAt) {
      this.removeTicket(ticketId);
      return { status: 'EXPIRED', message: '대기열 티켓이 만료되었습니다.' };
    }

    if (ticket.status === 'CANCELLED') {
      return { status: 'CANCELLED', message: '대기열이 취소되었습니다.' };
    }

    if (ticket.status === 'EXPIRED') {
      return { status: 'EXPIRED', message: '대기열 티켓이 만료되었습니다.' };
    }

    // WAITING 상태에서 lazy 승격 시도
    if (ticket.status === 'WAITING') {
      const promoted = await this.tryPromote(ticketId);
      if (promoted) {
        return this.buildReadyResponse(ticket);
      }

      const position = this.getPosition(ticketId);
      return {
        status: 'WAITING',
        position,
        estimatedWaitSeconds: position * this.ESTIMATED_SESSION_DURATION_SECONDS,
      };
    }

    // READY 상태
    if (ticket.status === 'READY') {
      // READY claim 만료 확인
      if (ticket.readyAt && Date.now() - ticket.readyAt.getTime() > this.QUEUE_READY_CLAIM_MS) {
        ticket.status = 'EXPIRED';
        this.removeTicket(ticketId);
        return { status: 'EXPIRED', message: 'READY 상태 유효 시간이 초과되었습니다.' };
      }
      return this.buildReadyResponse(ticket);
    }

    // ACTIVE 상태 (이미 세션이 사용 중)
    return { status: 'EXPIRED', message: '이미 사용된 티켓입니다.' };
  }

  /**
   * 대기열 취소
   */
  cancelQueue(ticketId: string): { success: boolean; message: string } {
    const ticket = this.ticketMap.get(ticketId);
    if (!ticket) {
      return { success: false, message: '티켓을 찾을 수 없습니다.' };
    }

    if (ticket.status === 'ACTIVE') {
      return { success: false, message: '이미 활성 상태인 세션은 대기열에서 취소할 수 없습니다.' };
    }

    ticket.status = 'CANCELLED';
    this.removeTicket(ticketId);
    this.logger.log(`대기열 취소: ticket=${ticketId}`);

    return { success: true, message: '대기열이 취소되었습니다.' };
  }

  /**
   * 전체 현황 조회
   */
  async getOverallStatus(): Promise<QueueOverallStatusResponse> {
    const stats = await this.uploadSessionDomainService.활성세션통계();

    return {
      activeSessions: stats.count,
      maxActiveSessions: this.MAX_ACTIVE_SESSIONS,
      waitingCount: this.waitingOrder.length,
      maxQueueSize: this.MAX_QUEUE_SIZE,
      totalUploadBytes: stats.totalBytes,
      maxTotalUploadBytes: this.MAX_TOTAL_UPLOAD_BYTES,
      availableSlots: Math.max(0, this.MAX_ACTIVE_SESSIONS - stats.count),
    };
  }

  /**
   * 다음 대기자 승격 (외부 호출용 - complete/abort/scheduler에서 호출)
   */
  async promoteNext(): Promise<void> {
    if (this.waitingOrder.length === 0) {
      return;
    }

    // 여러 슬롯이 비었을 수 있으므로 반복
    for (let i = 0; i < this.waitingOrder.length; i++) {
      const ticketId = this.waitingOrder[0]; // 항상 첫 번째
      if (!ticketId) break;

      const canAdmit = await this.checkCapacity(
        this.ticketMap.get(ticketId)?.request.totalSize ?? 0,
      );
      if (!canAdmit) break;

      await this.tryPromote(ticketId);
    }
  }

  // ============================================
  // 30초 간격 스케줄러 (안전망)
  // ============================================

  @Cron('*/30 * * * * *')
  async handleQueueMaintenance(): Promise<void> {
    const now = Date.now();
    let expiredCount = 0;
    let promotedCount = 0;

    // 1. READY 상태 5분 초과 미사용 티켓 만료
    for (const [ticketId, ticket] of this.ticketMap) {
      if (
        ticket.status === 'READY' &&
        ticket.readyAt &&
        now - ticket.readyAt.getTime() > this.QUEUE_READY_CLAIM_MS
      ) {
        ticket.status = 'EXPIRED';
        this.removeTicket(ticketId);
        expiredCount++;
      }
    }

    // 2. 대기열 티켓 TTL 초과 정리
    for (const [ticketId, ticket] of this.ticketMap) {
      if (
        (ticket.status === 'WAITING' || ticket.status === 'CANCELLED' || ticket.status === 'EXPIRED') &&
        new Date() > ticket.ticketExpiresAt
      ) {
        this.removeTicket(ticketId);
        expiredCount++;
      }
    }

    // 3. 슬롯 여유 시 다음 승격 (안전망)
    if (this.waitingOrder.length > 0) {
      const before = this.waitingOrder.length;
      await this.promoteNext();
      promotedCount = before - this.waitingOrder.length;
    }

    if (expiredCount > 0 || promotedCount > 0) {
      this.logger.log(
        `Queue maintenance: expired=${expiredCount}, promoted=${promotedCount}, waiting=${this.waitingOrder.length}`,
      );
    }
  }

  // ============================================
  // 내부 메서드
  // ============================================

  /**
   * 용량 확인 (글로벌 세션 수 + 총 바이트)
   */
  private async checkCapacity(additionalBytes: number): Promise<boolean> {
    const stats = await this.uploadSessionDomainService.활성세션통계();

    if (stats.count >= this.MAX_ACTIVE_SESSIONS) {
      return false;
    }

    if (stats.totalBytes + additionalBytes > this.MAX_TOTAL_UPLOAD_BYTES) {
      return false;
    }

    return true;
  }

  /**
   * 즉시 세션 생성
   */
  private async createSessionImmediately(
    request: InitiateMultipartRequest,
    userId: string,
  ): Promise<InitiateOrQueueResponse> {
    const result = await this.multipartUploadService.initiate(request);

    // 사용자 추적 (ACTIVE로 등록)
    const ticketId = `direct-${result.sessionId}`;
    this.trackUserTicket(userId, ticketId);

    return {
      status: 'ACTIVE',
      sessionId: result.sessionId,
      partSize: result.partSize,
      totalParts: result.totalParts,
      expiresAt: result.expiresAt,
    };
  }

  /**
   * 대기열에 등록
   */
  private enqueue(
    request: InitiateMultipartRequest,
    userId: string,
  ): InitiateOrQueueResponse {
    if (this.waitingOrder.length >= this.MAX_QUEUE_SIZE) {
      throw new Error(
        `대기열이 가득 찼습니다 (최대 ${this.MAX_QUEUE_SIZE}). 나중에 다시 시도해주세요.`,
      );
    }

    const ticketId = uuidv4();
    const now = new Date();

    const ticket: QueueTicket = {
      ticketId,
      userId,
      status: 'WAITING',
      request,
      createdAt: now,
      ticketExpiresAt: new Date(now.getTime() + this.QUEUE_TICKET_TTL_MS),
    };

    this.ticketMap.set(ticketId, ticket);
    this.waitingOrder.push(ticketId);
    this.trackUserTicket(userId, ticketId);

    const position = this.waitingOrder.length;

    this.logger.log(
      `대기열 등록: ticket=${ticketId}, user=${userId}, position=${position}, ` +
      `fileName=${request.fileName}, totalSize=${request.totalSize}`,
    );

    return {
      status: 'WAITING',
      queueTicket: ticketId,
      position,
      estimatedWaitSeconds: position * this.ESTIMATED_SESSION_DURATION_SECONDS,
    };
  }

  /**
   * 특정 티켓 승격 시도
   */
  private async tryPromote(ticketId: string): Promise<boolean> {
    const ticket = this.ticketMap.get(ticketId);
    if (!ticket || ticket.status !== 'WAITING') {
      return false;
    }

    // 사용자별 제한 재확인
    const userActiveCount = this.getUserActiveTicketCount(ticket.userId);
    if (userActiveCount >= this.MAX_SESSIONS_PER_USER) {
      return false;
    }

    const canAdmit = await this.checkCapacity(ticket.request.totalSize);
    if (!canAdmit) {
      return false;
    }

    try {
      // 세션 실제 생성
      const result = await this.multipartUploadService.initiate(ticket.request);

      ticket.status = 'READY';
      ticket.sessionId = result.sessionId;
      ticket.partSize = result.partSize;
      ticket.totalParts = result.totalParts;
      ticket.expiresAt = result.expiresAt;
      ticket.readyAt = new Date();

      // WAITING 배열에서 제거
      const idx = this.waitingOrder.indexOf(ticketId);
      if (idx !== -1) {
        this.waitingOrder.splice(idx, 1);
      }

      this.logger.log(
        `대기열 승격: ticket=${ticketId}, sessionId=${result.sessionId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `대기열 승격 실패: ticket=${ticketId}`,
        error instanceof Error ? error.stack : error,
      );
      return false;
    }
  }

  /**
   * READY 응답 빌드
   */
  private buildReadyResponse(ticket: QueueTicket): QueueStatusResponse {
    const claimDeadline = ticket.readyAt
      ? new Date(ticket.readyAt.getTime() + this.QUEUE_READY_CLAIM_MS).toISOString()
      : new Date(Date.now() + this.QUEUE_READY_CLAIM_MS).toISOString();

    return {
      status: 'READY',
      sessionId: ticket.sessionId!,
      partSize: ticket.partSize!,
      totalParts: ticket.totalParts!,
      expiresAt: ticket.expiresAt!,
      claimDeadline,
    };
  }

  /**
   * 티켓 위치(순번) 조회
   */
  private getPosition(ticketId: string): number {
    const idx = this.waitingOrder.indexOf(ticketId);
    return idx === -1 ? 0 : idx + 1;
  }

  /**
   * 티켓 제거 (모든 내부 자료구조에서)
   */
  private removeTicket(ticketId: string): void {
    const ticket = this.ticketMap.get(ticketId);
    if (ticket) {
      // 사용자 추적에서 제거
      const userSet = this.userTickets.get(ticket.userId);
      if (userSet) {
        userSet.delete(ticketId);
        if (userSet.size === 0) {
          this.userTickets.delete(ticket.userId);
        }
      }
    }

    // WAITING 배열에서 제거
    const idx = this.waitingOrder.indexOf(ticketId);
    if (idx !== -1) {
      this.waitingOrder.splice(idx, 1);
    }

    this.ticketMap.delete(ticketId);
  }

  /**
   * 사용자별 활성 티켓 수 (WAITING + READY + ACTIVE)
   */
  private getUserActiveTicketCount(userId: string): number {
    const userSet = this.userTickets.get(userId);
    if (!userSet) return 0;

    let count = 0;
    for (const ticketId of userSet) {
      const ticket = this.ticketMap.get(ticketId);
      if (ticket && (ticket.status === 'WAITING' || ticket.status === 'READY' || ticket.status === 'ACTIVE')) {
        count++;
      }
    }
    return count;
  }

  /**
   * 사용자 티켓 추적 등록
   */
  private trackUserTicket(userId: string, ticketId: string): void {
    if (!this.userTickets.has(userId)) {
      this.userTickets.set(userId, new Set());
    }
    this.userTickets.get(userId)!.add(ticketId);
  }
}
