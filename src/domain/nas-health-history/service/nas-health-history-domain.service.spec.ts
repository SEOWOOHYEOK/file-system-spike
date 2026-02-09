/**
 * ============================================================
 * 📦 NasHealthHistory 도메인 서비스 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - NasHealthHistoryDomainService.이력기록
 *   - NasHealthHistoryDomainService.이력조회
 *   - NasHealthHistoryDomainService.최신이력
 *   - NasHealthHistoryDomainService.오래된이력정리
 *
 * 📋 비즈니스 맥락:
 *   - NAS 헬스 체크 이력 저장 및 조회 도메인 로직
 *   - NAS Observability Dashboard의 헬스 체크 이력 관리
 *
 * ⚠️ 중요 고려사항:
 *   - 이력기록은 항상 새 엔티티 생성
 *   - error는 선택적이며 없으면 null로 저장
 * ============================================================
 */

// Mock uuid module (must be before imports)
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NasHealthHistoryDomainService } from './nas-health-history-domain.service';
import {
  NAS_HEALTH_HISTORY_REPOSITORY,
  type INasHealthHistoryRepository,
} from '../repositories/nas-health-history.repository.interface';
import {
  NasHealthHistoryEntity,
  NasHealthStatus,
} from '../entities/nas-health-history.entity';

describe('NasHealthHistoryDomainService', () => {
  let service: NasHealthHistoryDomainService;
  let mockRepo: jest.Mocked<INasHealthHistoryRepository>;

  /**
   * 🎭 Mock 설정
   * 📍 mockRepo:
   *   - 실제 동작: DB에서 NasHealthHistory CRUD 수행
   *   - Mock 이유: 실제 DB 연결 없이 도메인 서비스 로직 테스트
   */
  beforeEach(async () => {
    mockRepo = {
      save: jest.fn(),
      findRecentByHours: jest.fn(),
      findLatest: jest.fn(),
      deleteOlderThan: jest.fn(),
    } as jest.Mocked<INasHealthHistoryRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NasHealthHistoryDomainService,
        {
          provide: NAS_HEALTH_HISTORY_REPOSITORY,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<NasHealthHistoryDomainService>(
      NasHealthHistoryDomainService,
    );
  });

  /**
   * 📌 테스트 시나리오: 헬스 체크 이력 기록 (정상 케이스)
   *
   * 🎯 검증 목적:
   *   헬스 체크 이력이 올바르게 생성되고 저장되는지 확인
   *
   * ✅ 기대 결과:
   *   새 엔티티가 생성되고 저장됨
   */
  it('should record health history successfully', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const params = {
      status: NasHealthStatus.HEALTHY,
      responseTimeMs: 150,
      totalBytes: 1000000000,
      usedBytes: 500000000,
      freeBytes: 500000000,
    };
    const savedEntity = new NasHealthHistoryEntity({
      id: 'history-1',
      ...params,
      error: null,
      checkedAt: new Date(),
    });
    mockRepo.save.mockResolvedValue(savedEntity);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.이력기록(params);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(mockRepo.save).toHaveBeenCalled();
    const savedCall = mockRepo.save.mock.calls[0][0];
    expect(savedCall.status).toBe(NasHealthStatus.HEALTHY);
    expect(savedCall.responseTimeMs).toBe(150);
    expect(savedCall.totalBytes).toBe(1000000000);
    expect(savedCall.usedBytes).toBe(500000000);
    expect(savedCall.freeBytes).toBe(500000000);
    expect(savedCall.error).toBeNull();
    expect(savedCall.id).toBeDefined();
    expect(savedCall.checkedAt).toBeInstanceOf(Date);
    expect(result).toBe(savedEntity);
  });

  /**
   * 📌 테스트 시나리오: 헬스 체크 이력 기록 (에러 포함)
   *
   * 🎯 검증 목적:
   *   에러 메시지가 포함된 이력도 올바르게 저장되는지 확인
   *
   * ✅ 기대 결과:
   *   error 필드에 에러 메시지가 저장됨
   */
  it('should record health history with error', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const params = {
      status: NasHealthStatus.UNHEALTHY,
      responseTimeMs: 5000,
      totalBytes: 0,
      usedBytes: 0,
      freeBytes: 0,
      error: 'Connection timeout',
    };
    const savedEntity = new NasHealthHistoryEntity({
      id: 'history-1',
      ...params,
      checkedAt: new Date(),
    });
    mockRepo.save.mockResolvedValue(savedEntity);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.이력기록(params);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    const savedCall = mockRepo.save.mock.calls[0][0];
    expect(savedCall.error).toBe('Connection timeout');
    expect(savedCall.status).toBe(NasHealthStatus.UNHEALTHY);
    expect(result).toBe(savedEntity);
  });

  /**
   * 📌 테스트 시나리오: 최근 N시간 이력 조회
   *
   * 🎯 검증 목적:
   *   최근 N시간 이력이 올바르게 조회되는지 확인
   *
   * ✅ 기대 결과:
   *   findRecentByHours가 호출되고 결과 반환
   */
  it('should retrieve recent history by hours', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const histories = [
      new NasHealthHistoryEntity({
        id: 'history-1',
        status: NasHealthStatus.HEALTHY,
        responseTimeMs: 100,
        totalBytes: 1000,
        usedBytes: 500,
        freeBytes: 500,
        error: null,
        checkedAt: new Date(),
      }),
      new NasHealthHistoryEntity({
        id: 'history-2',
        status: NasHealthStatus.DEGRADED,
        responseTimeMs: 500,
        totalBytes: 1000,
        usedBytes: 800,
        freeBytes: 200,
        error: null,
        checkedAt: new Date(),
      }),
    ];
    mockRepo.findRecentByHours.mockResolvedValue(histories);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.이력조회(24);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result).toEqual(histories);
    expect(mockRepo.findRecentByHours).toHaveBeenCalledWith(24);
  });

  /**
   * 📌 테스트 시나리오: 최신 이력 조회 (이력 존재)
   *
   * 🎯 검증 목적:
   *   최신 이력이 올바르게 조회되는지 확인
   *
   * ✅ 기대 결과:
   *   최신 이력 반환
   */
  it('should retrieve latest history when exists', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const latestHistory = new NasHealthHistoryEntity({
      id: 'history-latest',
      status: NasHealthStatus.HEALTHY,
      responseTimeMs: 100,
      totalBytes: 1000,
      usedBytes: 500,
      freeBytes: 500,
      error: null,
      checkedAt: new Date(),
    });
    mockRepo.findLatest.mockResolvedValue(latestHistory);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.최신이력();

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result).toBe(latestHistory);
    expect(mockRepo.findLatest).toHaveBeenCalled();
  });

  /**
   * 📌 테스트 시나리오: 최신 이력 조회 (이력 없음)
   *
   * 🎯 검증 목적:
   *   이력이 없을 때 null이 반환되는지 확인
   *
   * ✅ 기대 결과:
   *   null 반환
   */
  it('should return null when no history exists', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    mockRepo.findLatest.mockResolvedValue(null);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.최신이력();

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result).toBeNull();
    expect(mockRepo.findLatest).toHaveBeenCalled();
  });

  /**
   * 📌 테스트 시나리오: 오래된 이력 정리
   *
   * 🎯 검증 목적:
   *   보관 기간보다 오래된 이력이 삭제되는지 확인
   *
   * ✅ 기대 결과:
   *   삭제된 레코드 수 반환
   */
  it('should delete old history records', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const deletedCount = 42;
    mockRepo.deleteOlderThan.mockResolvedValue(deletedCount);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.오래된이력정리(30);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result).toBe(deletedCount);
    expect(mockRepo.deleteOlderThan).toHaveBeenCalledWith(30);
  });
});
