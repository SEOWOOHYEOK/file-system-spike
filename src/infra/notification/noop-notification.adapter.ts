import { Injectable, Logger } from '@nestjs/common';
import { FileActionRequestNotificationPort } from '../../domain/file-action-request/ports/notification.port';

/**
 * No-op 알림 어댑터 (추후 실제 알림 서비스로 교체)
 */
@Injectable()
export class NoopNotificationAdapter implements FileActionRequestNotificationPort {
  private readonly logger = new Logger(NoopNotificationAdapter.name);

  async notifyNewRequest(params: {
    requestId: string;
    requesterId: string;
    approverId: string;
    actionType: string;
    fileName: string;
  }): Promise<void> {
    this.logger.debug(`[NOOP] notifyNewRequest: ${JSON.stringify(params)}`);
  }

  async notifyDecision(params: {
    requestId: string;
    requesterId: string;
    actionType: string;
    decision: string;
    comment?: string;
  }): Promise<void> {
    this.logger.debug(`[NOOP] notifyDecision: ${JSON.stringify(params)}`);
  }

  async notifyReminder(params: {
    requestId: string;
    approverId: string;
    actionType: string;
    fileName: string;
    pendingSince: Date;
  }): Promise<void> {
    this.logger.debug(`[NOOP] notifyReminder: ${JSON.stringify(params)}`);
  }
}
