/**
 * ============================================================
 * NAS 가용성 Guard 테스트
 * ============================================================
 *
 * 테스트 대상:
 *   - NasAvailabilityGuard
 *
 * 비즈니스 맥락:
 *   - NAS unhealthy 시 API 요청을 503으로 거부
 *   - degraded(느림)는 허용
 *   - healthy는 당연히 허용
 *
 * 중요 고려사항:
 *   - NasStatusCacheService 인메모리 캐시만 조회 (오버헤드 없음)
 *   - ServiceUnavailableException에 NAS_UNAVAILABLE 코드 포함
 *   - lastCheckedAt, error 정보 포함
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException, ExecutionContext } from '@nestjs/common';
import { NasAvailabilityGuard } from './nas-availability.guard';
import { NasStatusCacheService } from '../../infra/storage/nas/nas-status-cache.service';

describe('NasAvailabilityGuard', () => {
  let guard: NasAvailabilityGuard;
  let nasStatusCache: NasStatusCacheService;

  // ═══════════════════════════════════════════════════════
  // 테스트 모듈 설정
  // ═══════════════════════════════════════════════════════
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NasAvailabilityGuard, NasStatusCacheService],
    }).compile();

    guard = module.get<NasAvailabilityGuard>(NasAvailabilityGuard);
    nasStatusCache = module.get<NasStatusCacheService>(NasStatusCacheService);
  });

  /**
   * Mock ExecutionContext 생성 헬퍼
   */
  const createMockContext = (handlerName = 'testHandler'): ExecutionContext => {
    return {
      getHandler: jest.fn().mockReturnValue({ name: handlerName }),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({}),
      }),
    } as unknown as ExecutionContext;
  };

  // ═══════════════════════════════════════════════════════
  // healthy 상태
  // ═══════════════════════════════════════════════════════
  describe('NAS healthy 상태', () => {
    it('healthy이면 요청을 허용해야 한다', () => {
      // 📥 GIVEN: 초기 상태 (healthy)
      const context = createMockContext();

      // 🎬 WHEN
      const result = guard.canActivate(context);

      // ✅ THEN
      expect(result).toBe(true);
    });

    it('스케줄러가 healthy로 갱신한 후 요청을 허용해야 한다', () => {
      // 📥 GIVEN
      nasStatusCache.updateFromHealthCheck({ status: 'healthy' });
      const context = createMockContext();

      // 🎬 WHEN & ✅ THEN
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  // degraded 상태
  // ═══════════════════════════════════════════════════════
  describe('NAS degraded 상태', () => {
    it('degraded이면 요청을 허용해야 한다 (느리더라도 연결됨)', () => {
      // 📥 GIVEN
      nasStatusCache.updateFromHealthCheck({ status: 'degraded' });
      const context = createMockContext();

      // 🎬 WHEN
      const result = guard.canActivate(context);

      // ✅ THEN
      expect(result).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  // unhealthy 상태
  // ═══════════════════════════════════════════════════════
  describe('NAS unhealthy 상태', () => {
    it('unhealthy이면 ServiceUnavailableException을 던져야 한다', () => {
      // 📥 GIVEN
      nasStatusCache.updateFromHealthCheck({
        status: 'unhealthy',
        error: 'NAS 연결 타임아웃',
      });
      const context = createMockContext('upload');

      // 🎬 WHEN & ✅ THEN
      expect(() => guard.canActivate(context)).toThrow(
        ServiceUnavailableException,
      );
    });

    it('에러 응답에 NAS_UNAVAILABLE 코드가 포함되어야 한다', () => {
      // 📥 GIVEN
      nasStatusCache.updateFromHealthCheck({
        status: 'unhealthy',
        error: 'ECONNREFUSED',
      });
      const context = createMockContext();

      // 🎬 WHEN & ✅ THEN
      try {
        guard.canActivate(context);
        fail('예외가 발생해야 합니다');
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        const response = (error as ServiceUnavailableException).getResponse();
        expect(response).toMatchObject({
          code: 'NAS_UNAVAILABLE',
          message: 'NAS 스토리지에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
          error: 'ECONNREFUSED',
        });
      }
    });

    it('에러 응답에 lastCheckedAt이 포함되어야 한다', () => {
      // 📥 GIVEN
      nasStatusCache.updateFromHealthCheck({ status: 'unhealthy', error: 'timeout' });
      const context = createMockContext();

      // 🎬 WHEN & ✅ THEN
      try {
        guard.canActivate(context);
        fail('예외가 발생해야 합니다');
      } catch (error) {
        const response = (error as ServiceUnavailableException).getResponse() as Record<string, unknown>;
        expect(response.lastCheckedAt).toBeInstanceOf(Date);
      }
    });

    it('워커가 markUnhealthy 후 Guard가 요청을 거부해야 한다', () => {
      // 📥 GIVEN: 워커가 NAS 에러 감지
      nasStatusCache.markUnhealthy('ENETUNREACH');
      const context = createMockContext();

      // 🎬 WHEN & ✅ THEN
      expect(() => guard.canActivate(context)).toThrow(
        ServiceUnavailableException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════
  // 상태 복구 시나리오
  // ═══════════════════════════════════════════════════════
  describe('상태 복구 시나리오', () => {
    it('unhealthy → 스케줄러 healthy 복구 → Guard 허용', () => {
      // 📥 GIVEN: unhealthy 상태
      nasStatusCache.updateFromHealthCheck({ status: 'unhealthy', error: '장애' });
      const context = createMockContext();
      expect(() => guard.canActivate(context)).toThrow();

      // 🎬 WHEN: 스케줄러가 복구 감지
      nasStatusCache.updateFromHealthCheck({ status: 'healthy' });

      // ✅ THEN: 요청 허용
      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
