/**
 * SyncEvent 생명주기 공통 헬퍼
 *
 * NasSyncWorker / NasFolderSyncWorker 양쪽에서 중복되던
 * SyncEvent 상태 관리 로직(조회, PROCESSING, DONE, retry, fail)을 통합합니다.
 */
import { Injectable, Logger } from '@nestjs/common';
import { SyncEventEntity } from '../../../domain/sync-event/entities/sync-event.entity';
import { SyncEventDomainService } from '../../../domain/sync-event/service/sync-event-domain.service';

@Injectable()
export class SyncEventLifecycleHelper {
  private readonly logger = new Logger(SyncEventLifecycleHelper.name);

  constructor(
    private readonly syncEventDomainService: SyncEventDomainService,
  ) {}

  /**
   * SyncEvent 조회 (없으면 null)
   */
  async getSyncEvent(syncEventId?: string): Promise<SyncEventEntity | null> {
    if (!syncEventId) return null;
    return this.syncEventDomainService.조회(syncEventId);
  }

  /**
   * SyncEvent 처리 시작 (PROCESSING)
   */
  async markProcessing(syncEvent: SyncEventEntity | null): Promise<void> {
    if (!syncEvent) return;
    syncEvent.startProcessing();
    await this.syncEventDomainService.저장(syncEvent);
  }

  /**
   * SyncEvent 성공 완료 (DONE)
   */
  async markDone(syncEvent: SyncEventEntity | null): Promise<void> {
    if (!syncEvent) return;
    syncEvent.complete();
    await this.syncEventDomainService.저장(syncEvent);
  }

  /**
   * SyncEvent 실패 마킹
   */
  async markFailed(syncEvent: SyncEventEntity | null, reason: string): Promise<void> {
    if (!syncEvent) return;
    syncEvent.fail(reason);
    await this.syncEventDomainService.저장(syncEvent);
  }

  /**
   * SyncEvent 재시도 처리
   * - 재시도 가능: PENDING 상태로 롤백
   * - 재시도 불가 (한도 초과): FAILED 상태로 마킹 + 알림 로그
   *
   * @param context - 알림 로그에 포함할 컨텍스트 문자열 (예: "action=upload | fileId=xxx")
   */
  async handleRetry(
    syncEvent: SyncEventEntity | null,
    error: Error,
    context: string,
  ): Promise<void> {
    if (!syncEvent) return;

    const detailMessage = this.extractDetailedErrorMessage(error);
    const shouldRetry = syncEvent.retry(detailMessage);
    await this.syncEventDomainService.저장(syncEvent);

    if (!shouldRetry) {
      syncEvent.fail(detailMessage);
      await this.syncEventDomainService.저장(syncEvent);
      this.logger.error(
        `[동기화_최종실패] ${context} | syncEventId=${syncEvent.id} | error=${error.message}`,
      );
    }
  }

  /**
   * 에러에서 상세 메시지 추출
   * - cause가 있으면 원본 에러 메시지 포함
   */
  private extractDetailedErrorMessage(error: Error): string {
    const cause = error.cause as Error | undefined;
    if (cause?.message) {
      return `${error.message}: ${cause.message}`;
    }
    return error.message;
  }
}
