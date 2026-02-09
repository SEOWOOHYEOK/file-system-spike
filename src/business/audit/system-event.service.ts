import { Injectable, Inject } from '@nestjs/common';
import {
  SystemEvent,
  CreateSystemEventParams,
} from '../../domain/audit/entities/system-event.entity';
import type { ISystemEventRepository } from '../../domain/audit/repositories/system-event.repository';
import { SYSTEM_EVENT_REPOSITORY } from '../../domain/audit/repositories/system-event.repository';
import { resolveSystemAction } from '../../domain/audit/service/system-action-resolver';
import { EventDescriptionBuilder } from '../../domain/audit/service/description-builder';

/**
 * SystemEventService
 *
 * 시스템 이벤트 기록 서비스
 */
@Injectable()
export class SystemEventService {
  constructor(
    @Inject(SYSTEM_EVENT_REPOSITORY)
    private readonly repository: ISystemEventRepository,
  ) {}

  /**
   * 시스템 이벤트 기록
   */
  async record(params: CreateSystemEventParams): Promise<void> {
    // Auto-resolve systemAction if not explicitly provided
    if (!params.systemAction && params.errorCode) {
      params.systemAction = resolveSystemAction(params.errorCode);
    }

    // Auto-generate description if not provided
    if (!params.description) {
      params.description = EventDescriptionBuilder.forSystemEvent({
        component: params.component,
        eventType: params.eventType,
        result: params.result,
        previousState: params.previousState,
        newState: params.newState,
        targetName: params.targetName,
        errorCode: params.errorCode,
        retryCount: params.retryCount,
        metadata: params.metadata,
      });
    }

    const event = SystemEvent.create(params);
    await this.repository.save(event);
  }

  /**
   * 시스템 이벤트 배치 기록
   */
  async recordBatch(params: CreateSystemEventParams[]): Promise<void> {
    const events = params.map((p) => SystemEvent.create(p));
    await this.repository.saveBatch(events);
  }
}
