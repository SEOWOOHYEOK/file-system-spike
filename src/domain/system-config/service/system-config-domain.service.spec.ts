/**
 * ============================================================
 * 📦 SystemConfig 도메인 서비스 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - SystemConfigDomainService.getNumberConfig
 *   - SystemConfigDomainService.getStringConfig
 *   - SystemConfigDomainService.getConfigsByPrefix
 *   - SystemConfigDomainService.updateConfig
 *
 * 📋 비즈니스 맥락:
 *   - 시스템 설정 조회 및 업데이트 도메인 로직
 *   - NAS Observability Dashboard의 관리자 설정 관리
 *
 * ⚠️ 중요 고려사항:
 *   - 설정이 없으면 기본값 반환
 *   - updateConfig는 없으면 생성, 있으면 수정
 * ============================================================
 */

// Mock uuid module (must be before imports)
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { SystemConfigDomainService } from './system-config-domain.service';
import {
  SYSTEM_CONFIG_REPOSITORY,
  type ISystemConfigRepository,
} from '../repositories/system-config.repository.interface';
import { SystemConfigEntity } from '../entities/system-config.entity';

describe('SystemConfigDomainService', () => {
  let service: SystemConfigDomainService;
  let mockRepo: jest.Mocked<ISystemConfigRepository>;

  /**
   * 🎭 Mock 설정
   * 📍 mockRepo:
   *   - 실제 동작: DB에서 SystemConfig CRUD 수행
   *   - Mock 이유: 실제 DB 연결 없이 도메인 서비스 로직 테스트
   */
  beforeEach(async () => {
    mockRepo = {
      findByKey: jest.fn(),
      findAll: jest.fn(),
      findByKeyPrefix: jest.fn(),
      save: jest.fn(),
    } as jest.Mocked<ISystemConfigRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemConfigDomainService,
        {
          provide: SYSTEM_CONFIG_REPOSITORY,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<SystemConfigDomainService>(
      SystemConfigDomainService,
    );
  });

  /**
   * 📌 테스트 시나리오: 숫자 설정값 조회 (설정 존재)
   *
   * 🎯 검증 목적:
   *   설정이 존재할 때 숫자 값이 올바르게 파싱되어 반환되는지 확인
   *
   * ✅ 기대 결과:
   *   파싱된 숫자 값 반환
   */
  it('should return parsed number value when config exists', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const entity = new SystemConfigEntity({
      id: 'config-1',
      key: 'health.check.interval',
      value: '300',
      description: 'Interval',
      updatedAt: new Date(),
      updatedBy: 'admin',
    });
    mockRepo.findByKey.mockResolvedValue(entity);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.getNumberConfig('health.check.interval', 100);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result).toBe(300);
    expect(mockRepo.findByKey).toHaveBeenCalledWith('health.check.interval');
  });

  /**
   * 📌 테스트 시나리오: 숫자 설정값 조회 (설정 없음)
   *
   * 🎯 검증 목적:
   *   설정이 없을 때 기본값이 반환되는지 확인
   *
   * ✅ 기대 결과:
   *   기본값 반환
   */
  it('should return default value when config does not exist', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    mockRepo.findByKey.mockResolvedValue(null);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.getNumberConfig('health.check.interval', 100);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result).toBe(100);
    expect(mockRepo.findByKey).toHaveBeenCalledWith('health.check.interval');
  });

  /**
   * 📌 테스트 시나리오: 문자열 설정값 조회 (설정 존재)
   *
   * 🎯 검증 목적:
   *   설정이 존재할 때 문자열 값이 반환되는지 확인
   *
   * ✅ 기대 결과:
   *   설정 값 반환
   */
  it('should return string value when config exists', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const entity = new SystemConfigEntity({
      id: 'config-1',
      key: 'system.name',
      value: 'NAS Dashboard',
      description: 'System name',
      updatedAt: new Date(),
      updatedBy: 'admin',
    });
    mockRepo.findByKey.mockResolvedValue(entity);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.getStringConfig('system.name', 'Default');

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result).toBe('NAS Dashboard');
    expect(mockRepo.findByKey).toHaveBeenCalledWith('system.name');
  });

  /**
   * 📌 테스트 시나리오: 문자열 설정값 조회 (설정 없음)
   *
   * 🎯 검증 목적:
   *   설정이 없을 때 기본값이 반환되는지 확인
   *
   * ✅ 기대 결과:
   *   기본값 반환
   */
  it('should return default string value when config does not exist', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    mockRepo.findByKey.mockResolvedValue(null);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.getStringConfig('system.name', 'Default');

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result).toBe('Default');
    expect(mockRepo.findByKey).toHaveBeenCalledWith('system.name');
  });

  /**
   * 📌 테스트 시나리오: 접두사로 설정 목록 조회
   *
   * 🎯 검증 목적:
   *   키 접두사로 여러 설정을 조회할 수 있는지 확인
   *
   * ✅ 기대 결과:
   *   접두사에 매칭되는 설정 목록 반환
   */
  it('should return configs by prefix', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const configs = [
      new SystemConfigEntity({
        id: 'config-1',
        key: 'health.check.interval',
        value: '300',
        description: 'Interval',
        updatedAt: new Date(),
        updatedBy: 'admin',
      }),
      new SystemConfigEntity({
        id: 'config-2',
        key: 'health.check.timeout',
        value: '60',
        description: 'Timeout',
        updatedAt: new Date(),
        updatedBy: 'admin',
      }),
    ];
    mockRepo.findByKeyPrefix.mockResolvedValue(configs);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.getConfigsByPrefix('health.check');

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result).toEqual(configs);
    expect(mockRepo.findByKeyPrefix).toHaveBeenCalledWith('health.check');
  });

  /**
   * 📌 테스트 시나리오: 설정 업데이트 (기존 설정 수정)
   *
   * 🎯 검증 목적:
   *   기존 설정이 있을 때 값이 업데이트되는지 확인
   *
   * ✅ 기대 결과:
   *   기존 엔티티의 값과 수정 정보가 업데이트되고 저장됨
   */
  it('should update existing config', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const existingEntity = new SystemConfigEntity({
      id: 'config-1',
      key: 'health.check.interval',
      value: '300',
      description: 'Interval',
      updatedAt: new Date('2026-01-01'),
      updatedBy: 'admin-001',
    });
    mockRepo.findByKey.mockResolvedValue(existingEntity);
    mockRepo.save.mockResolvedValue(existingEntity);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.updateConfig(
      'health.check.interval',
      '600',
      'admin-002',
    );

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(existingEntity.value).toBe('600');
    expect(existingEntity.updatedBy).toBe('admin-002');
    expect(existingEntity.updatedAt).toBeInstanceOf(Date);
    expect(mockRepo.save).toHaveBeenCalledWith(existingEntity);
    expect(result).toBe(existingEntity);
  });

  /**
   * 📌 테스트 시나리오: 설정 생성 (신규 설정)
   *
   * 🎯 검증 목적:
   *   설정이 없을 때 새로 생성되는지 확인
   *
   * ✅ 기대 결과:
   *   새 엔티티가 생성되고 저장됨
   */
  it('should create new config when it does not exist', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    mockRepo.findByKey.mockResolvedValue(null);
    const newEntity = new SystemConfigEntity({
      id: 'config-new',
      key: 'health.check.interval',
      value: '300',
      description: 'Interval',
      updatedAt: new Date(),
      updatedBy: 'admin',
    });
    mockRepo.save.mockResolvedValue(newEntity);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.updateConfig(
      'health.check.interval',
      '300',
      'admin',
      'Interval',
    );

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(mockRepo.save).toHaveBeenCalled();
    const savedEntity = mockRepo.save.mock.calls[0][0];
    expect(savedEntity.key).toBe('health.check.interval');
    expect(savedEntity.value).toBe('300');
    expect(savedEntity.updatedBy).toBe('admin');
    expect(savedEntity.description).toBe('Interval');
    expect(savedEntity.id).toBeDefined();
    expect(savedEntity.updatedAt).toBeInstanceOf(Date);
  });

  /**
   * 📌 테스트 시나리오: 설정 업데이트 (설명 없이 생성)
   *
   * 🎯 검증 목적:
   *   설명 없이 설정을 생성할 때 빈 문자열로 설정되는지 확인
   *
   * ✅ 기대 결과:
   *   description이 빈 문자열로 설정됨
   */
  it('should create config with empty description when not provided', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    mockRepo.findByKey.mockResolvedValue(null);
    const newEntity = new SystemConfigEntity({
      id: 'config-new',
      key: 'health.check.interval',
      value: '300',
      description: '',
      updatedAt: new Date(),
      updatedBy: 'admin',
    });
    mockRepo.save.mockResolvedValue(newEntity);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    await service.updateConfig('health.check.interval', '300', 'admin');

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    const savedEntity = mockRepo.save.mock.calls[0][0];
    expect(savedEntity.description).toBe('');
  });
});
