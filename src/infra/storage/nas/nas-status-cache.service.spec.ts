/**
 * ============================================================
 * NAS 상태 캐시 서비스 테스트
 * ============================================================
 *
 * 테스트 대상:
 *   - NasStatusCacheService
 *
 * 비즈니스 맥락:
 *   - NAS 스토리지 가용 상태를 인메모리로 캐싱
 *   - 스케줄러: 모든 상태 전환 가능 (healthy/degraded/unhealthy)
 *   - 워커: unhealthy로만 전환 가능 (상태 진동 방지)
 *   - Guard/워커: 읽기 전용 조회
 *
 * 중요 고려사항:
 *   - 초기 상태는 healthy (낙관적)
 *   - degraded는 available (true)
 *   - unhealthy만 unavailable (false)
 *   - 워커는 healthy로 복구 불가 (스케줄러만 가능)
 *   - 알 수 없는 상태는 unhealthy 처리
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NasStatusCacheService } from './nas-status-cache.service';

describe('NasStatusCacheService', () => {
  let service: NasStatusCacheService;

  // ═══════════════════════════════════════════════════════
  // 테스트 모듈 설정
  // ═══════════════════════════════════════════════════════
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NasStatusCacheService],
    }).compile();

    service = module.get<NasStatusCacheService>(NasStatusCacheService);
  });

  // ═══════════════════════════════════════════════════════
  // 초기 상태
  // ═══════════════════════════════════════════════════════
  describe('초기 상태', () => {
    it('초기 상태는 healthy여야 한다', () => {
      // 📥 GIVEN: 새로 생성된 서비스
      // 🎬 WHEN: 상태 조회
      const status = service.getStatus();

      // ✅ THEN: healthy
      expect(status.status).toBe('healthy');
    });

    it('초기에 isAvailable은 true여야 한다', () => {
      expect(service.isAvailable()).toBe(true);
    });

    it('초기 lastCheckedAt은 epoch(0)이어야 한다', () => {
      const status = service.getStatus();
      expect(status.lastCheckedAt.getTime()).toBe(0);
    });

    it('초기 lastError는 undefined여야 한다', () => {
      const status = service.getStatus();
      expect(status.lastError).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════
  // updateFromHealthCheck (스케줄러 전용)
  // ═══════════════════════════════════════════════════════
  describe('updateFromHealthCheck (스케줄러)', () => {
    it('healthy → healthy 전환 시 상태가 유지되어야 한다', () => {
      // 📥 GIVEN: 초기 healthy 상태
      // 🎬 WHEN: healthy로 갱신
      service.updateFromHealthCheck({ status: 'healthy' });

      // ✅ THEN
      expect(service.getStatus().status).toBe('healthy');
      expect(service.isAvailable()).toBe(true);
    });

    it('healthy → degraded 전환이 가능해야 한다', () => {
      // 🎬 WHEN
      service.updateFromHealthCheck({ status: 'degraded' });

      // ✅ THEN: degraded이지만 available
      expect(service.getStatus().status).toBe('degraded');
      expect(service.isAvailable()).toBe(true);
    });

    it('healthy → unhealthy 전환이 가능해야 한다', () => {
      // 🎬 WHEN
      service.updateFromHealthCheck({ status: 'unhealthy', error: 'NAS 연결 실패' });

      // ✅ THEN
      expect(service.getStatus().status).toBe('unhealthy');
      expect(service.isAvailable()).toBe(false);
      expect(service.getStatus().lastError).toBe('NAS 연결 실패');
    });

    it('unhealthy → healthy 복구가 가능해야 한다 (스케줄러)', () => {
      // 📥 GIVEN: unhealthy 상태
      service.updateFromHealthCheck({ status: 'unhealthy', error: '타임아웃' });
      expect(service.isAvailable()).toBe(false);

      // 🎬 WHEN: 스케줄러가 healthy로 복구
      service.updateFromHealthCheck({ status: 'healthy' });

      // ✅ THEN: 복구됨
      expect(service.getStatus().status).toBe('healthy');
      expect(service.isAvailable()).toBe(true);
    });

    it('unhealthy → degraded 복구가 가능해야 한다 (스케줄러)', () => {
      // 📥 GIVEN
      service.updateFromHealthCheck({ status: 'unhealthy', error: '타임아웃' });

      // 🎬 WHEN
      service.updateFromHealthCheck({ status: 'degraded' });

      // ✅ THEN
      expect(service.getStatus().status).toBe('degraded');
      expect(service.isAvailable()).toBe(true);
    });

    it('lastCheckedAt이 갱신되어야 한다', () => {
      // 📥 GIVEN
      const before = new Date();

      // 🎬 WHEN
      service.updateFromHealthCheck({ status: 'healthy' });

      // ✅ THEN
      const after = new Date();
      const checkedAt = service.getStatus().lastCheckedAt;
      expect(checkedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(checkedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('error가 저장되어야 한다', () => {
      service.updateFromHealthCheck({ status: 'unhealthy', error: 'connection timeout' });
      expect(service.getStatus().lastError).toBe('connection timeout');
    });

    it('error가 없으면 undefined로 초기화되어야 한다', () => {
      // 📥 GIVEN: 에러가 있는 상태
      service.updateFromHealthCheck({ status: 'unhealthy', error: '에러 발생' });

      // 🎬 WHEN: 에러 없이 갱신
      service.updateFromHealthCheck({ status: 'healthy' });

      // ✅ THEN
      expect(service.getStatus().lastError).toBeUndefined();
    });

    it('알 수 없는 상태는 unhealthy로 처리되어야 한다', () => {
      service.updateFromHealthCheck({ status: 'unknown_status' });

      expect(service.getStatus().status).toBe('unhealthy');
      expect(service.isAvailable()).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════
  // markUnhealthy (워커 전용)
  // ═══════════════════════════════════════════════════════
  describe('markUnhealthy (워커)', () => {
    it('healthy → unhealthy 전환이 가능해야 한다', () => {
      // 🎬 WHEN
      service.markUnhealthy('ECONNREFUSED');

      // ✅ THEN
      expect(service.getStatus().status).toBe('unhealthy');
      expect(service.isAvailable()).toBe(false);
      expect(service.getStatus().lastError).toBe('ECONNREFUSED');
    });

    it('degraded → unhealthy 전환이 가능해야 한다', () => {
      // 📥 GIVEN: degraded 상태
      service.updateFromHealthCheck({ status: 'degraded' });

      // 🎬 WHEN
      service.markUnhealthy('ETIMEDOUT');

      // ✅ THEN
      expect(service.getStatus().status).toBe('unhealthy');
      expect(service.isAvailable()).toBe(false);
    });

    it('이미 unhealthy이면 중복 호출을 무시해야 한다', () => {
      // 📥 GIVEN: 이미 unhealthy
      service.markUnhealthy('첫 번째 에러');
      const firstCheckedAt = service.getStatus().lastCheckedAt;

      // 🎬 WHEN: 다시 markUnhealthy 호출
      service.markUnhealthy('두 번째 에러');

      // ✅ THEN: 첫 번째 에러 정보가 유지됨
      expect(service.getStatus().lastError).toBe('첫 번째 에러');
      expect(service.getStatus().lastCheckedAt).toBe(firstCheckedAt);
    });

    it('워커가 markUnhealthy 후 스케줄러가 healthy로 복구 가능해야 한다', () => {
      // 📥 GIVEN: 워커가 unhealthy로 전환
      service.markUnhealthy('ENETUNREACH');
      expect(service.isAvailable()).toBe(false);

      // 🎬 WHEN: 스케줄러가 healthy로 복구
      service.updateFromHealthCheck({ status: 'healthy' });

      // ✅ THEN: 복구됨
      expect(service.isAvailable()).toBe(true);
      expect(service.getStatus().status).toBe('healthy');
    });
  });

  // ═══════════════════════════════════════════════════════
  // isAvailable
  // ═══════════════════════════════════════════════════════
  describe('isAvailable', () => {
    it.each([
      ['healthy', true],
      ['degraded', true],
      ['unhealthy', false],
    ])('상태가 %s이면 isAvailable은 %s여야 한다', (status, expected) => {
      service.updateFromHealthCheck({ status });
      expect(service.isAvailable()).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getStatus 스냅샷
  // ═══════════════════════════════════════════════════════
  describe('getStatus', () => {
    it('전체 스냅샷을 반환해야 한다', () => {
      service.updateFromHealthCheck({ status: 'degraded', error: 'slow response' });

      const snapshot = service.getStatus();
      expect(snapshot).toEqual({
        status: 'degraded',
        lastCheckedAt: expect.any(Date),
        lastError: 'slow response',
      });
    });
  });
});
