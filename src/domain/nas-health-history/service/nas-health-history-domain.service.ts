/**
 * NAS 헬스 체크 이력 도메인 서비스
 * NAS 헬스 체크 이력 저장, 조회, 정리 도메인 로직을 담당합니다.
 *
 * DDD 규칙: Repository는 Domain Service에서만 주입받습니다.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  NasHealthHistoryEntity,
  NasHealthStatus,
} from '../entities/nas-health-history.entity';
import {
  NAS_HEALTH_HISTORY_REPOSITORY,
  type INasHealthHistoryRepository,
} from '../repositories/nas-health-history.repository.interface';

export interface RecordHealthParams {
  status: NasHealthStatus;
  responseTimeMs: number;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  error?: string;
}

@Injectable()
export class NasHealthHistoryDomainService {
  private readonly logger = new Logger(NasHealthHistoryDomainService.name);

  constructor(
    @Inject(NAS_HEALTH_HISTORY_REPOSITORY)
    private readonly repo: INasHealthHistoryRepository,
  ) {}

  /**
   * 헬스 체크 이력 기록
   */
  async 이력기록(params: RecordHealthParams): Promise<NasHealthHistoryEntity> {
    const entity = new NasHealthHistoryEntity({
      id: uuidv4(),
      status: params.status,
      responseTimeMs: params.responseTimeMs,
      totalBytes: params.totalBytes,
      usedBytes: params.usedBytes,
      freeBytes: params.freeBytes,
      error: params.error || null,
      checkedAt: new Date(),
    });

    return this.repo.save(entity);
  }

  /**
   * 최근 N시간 이력 조회
   */
  async 이력조회(hours: number): Promise<NasHealthHistoryEntity[]> {
    return this.repo.findRecentByHours(hours);
  }

  /**
   * 최신 이력 조회
   */
  async 최신이력(): Promise<NasHealthHistoryEntity | null> {
    return this.repo.findLatest();
  }

  /**
   * 오래된 이력 정리
   */
  async 오래된이력정리(retentionDays: number): Promise<number> {
    return this.repo.deleteOlderThan(retentionDays);
  }
}
