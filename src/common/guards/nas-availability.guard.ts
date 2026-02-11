/**
 * NAS 가용성 Guard
 *
 * NAS 스토리지가 unhealthy 상태이면 요청을 503으로 거부합니다.
 * degraded 상태(응답 느림)는 허용하며, 로그만 남깁니다.
 *
 * NasStatusCacheService의 인메모리 캐시를 조회하므로 오버헤드가 거의 없습니다.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NasStatusCacheService } from '../../infra/storage/nas/nas-status-cache.service';

@Injectable()
export class NasAvailabilityGuard implements CanActivate {
  private readonly logger = new Logger(NasAvailabilityGuard.name);

  constructor(private readonly nasStatusCache: NasStatusCacheService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.nasStatusCache.isAvailable()) {
      const { lastCheckedAt, lastError } = this.nasStatusCache.getStatus();
      this.logger.warn(
        `NAS 불가 - 요청 거부: ${context.getHandler().name} (마지막 체크: ${lastCheckedAt.toISOString()})`,
      );
      throw new ServiceUnavailableException({
        code: 'NAS_UNAVAILABLE',
        message:
          'NAS 스토리지에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
        lastCheckedAt,
        error: lastError,
      });
    }
    return true;
  }
}
