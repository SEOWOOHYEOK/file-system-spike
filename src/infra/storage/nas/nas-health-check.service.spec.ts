/**
 * ============================================================
 * 📦 NAS Health Check 도메인 서비스 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - NasHealthCheckService
 *
 * 📋 비즈니스 맥락:
 *   - 운영체제 환경을 감지하여 적절한 방식으로 NAS 연결 상태 확인
 *   - Windows: PowerShell + UNC 경로를 통한 매핑 드라이브 용량 조회
 *   - Linux/Docker: df 명령어를 통한 마운트 경로 용량 조회
 *
 * ⚠️ 중요 고려사항:
 *   - Windows에서는 UNC 경로 + PowerShell, Linux에서는 df 명령어 사용
 *   - OS 감지는 os.platform()으로 자동 수행
 *   - 실행 실패 시 unhealthy 상태 반환
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';
import { NasHealthCheckService, NasHealthResult, NasCapacity } from './nas-health-check.service';

const isWindows = os.platform() === 'win32';

describe('NasHealthCheckService', () => {
  let service: NasHealthCheckService;
  let configService: jest.Mocked<ConfigService>;

  /**
   * 🎭 Mock 설정
   * 📍 configService.get('NAS_MOUNT_PATH'):
   *   - 실제 동작: 환경변수에서 NAS 경로 조회
   *   - Mock 이유: 테스트 환경에서 실제 NAS 연결 없이 경로 설정
   */
  beforeEach(async () => {
    configService = {
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NasHealthCheckService,
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<NasHealthCheckService>(
      NasHealthCheckService,
    );
  });

  describe('checkHealth - 공통', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - NAS 연결 성공 및 용량 정보 반환
     *
     * 🎯 검증 목적:
     *   OS에 맞는 경로를 설정하면 checkHealth가 정상 동작해야 한다.
     *
     * ✅ 기대 결과:
     *   - status는 'healthy', 'degraded', 'unhealthy' 중 하나
     *   - checkedAt이 유효한 Date
     */
    it('should return valid health result when NAS path is configured', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const testPath = isWindows
        ? '\\\\192.168.10.249\\Web'
        : '/tmp';
      configService.get.mockReturnValue(testPath);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.checkHealth();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
      expect(result.checkedAt).toBeInstanceOf(Date);
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    /**
     * 📌 테스트 시나리오: 에러 케이스 - NAS 경로 미설정
     *
     * 🎯 검증 목적:
     *   NAS_MOUNT_PATH가 설정되지 않으면 unhealthy 상태를 반환해야 한다.
     *
     * ✅ 기대 결과:
     *   - status = 'unhealthy'
     *   - error에 원인 메시지 포함
     */
    it('should return unhealthy status when NAS_MOUNT_PATH is not configured', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      configService.get.mockReturnValue(undefined);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.checkHealth();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('NAS_MOUNT_PATH');
    });

    /**
     * 📌 테스트 시나리오: 에러 케이스 - 잘못된 경로
     *
     * 🎯 검증 목적:
     *   유효하지 않은 경로가 설정되면 unhealthy 상태를 반환해야 한다.
     *
     * ✅ 기대 결과:
     *   - status = 'unhealthy'
     */
    it('should return unhealthy status when path is invalid', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      configService.get.mockReturnValue('invalid-path');

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.checkHealth();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.status).toBe('unhealthy');
    });
  });

  describe('NasHealthResult interface', () => {
    /**
     * 📌 테스트 시나리오: 인터페이스 검증 - 결과 구조 확인
     *
     * 🎯 검증 목적:
     *   NasHealthResult가 올바른 구조를 가지는지 확인한다.
     *
     * ✅ 기대 결과:
     *   - status, responseTimeMs, checkedAt 필수
     */
    it('should have correct structure in result', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const testPath = isWindows
        ? '\\\\192.168.10.249\\Web'
        : '/tmp';
      configService.get.mockReturnValue(testPath);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.checkHealth();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('responseTimeMs');
      expect(result).toHaveProperty('checkedAt');
    });
  });

  // Windows 환경에서만 UNC 경로 파싱 테스트 실행
  (isWindows ? describe : describe.skip)('UNC 경로 파싱 (Windows 전용)', () => {
    /**
     * 📌 테스트 시나리오: 다양한 UNC 경로 형식 처리
     *
     * 🎯 검증 목적:
     *   다양한 이스케이프 형식의 UNC 경로가 올바르게 파싱되는지 확인한다.
     */
    it.each([
      ['\\\\192.168.10.249\\Web', '표준 UNC 경로 (백슬래시 2개)'],
      ['\\\\\\\\192.168.10.249\\\\Web', '이스케이프된 UNC 경로 (백슬래시 4개)'],
      ['//192.168.10.249/Web', '슬래시 형식 UNC 경로'],
      ['\\\\192.168.10.249\\Web\\personal\\서우혁\\dms', '하위 폴더 포함 UNC 경로'],
      ['\\\\\\\\192.168.10.249\\\\Web\\\\personal\\\\서우혁\\\\dms', '이스케이프된 하위 폴더 포함'],
    ])('should handle UNC path: %s (%s)', async (uncPath, _description) => {
      configService.get.mockReturnValue(uncPath);
      const result = await service.checkHealth();

      if (result.error) {
        expect(result.error).not.toContain('파싱 실패');
      }
      expect(result).toHaveProperty('status');
    });

    /**
     * 📌 테스트 시나리오: 잘못된 UNC 경로 - 서버만 있는 경우
     */
    it('should fail when UNC path has only server without share', async () => {
      configService.get.mockReturnValue('\\\\192.168.10.249');
      const result = await service.checkHealth();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('파싱 실패');
    });
  });

  // Linux/Docker 환경에서만 마운트 경로 테스트 실행
  (!isWindows ? describe : describe.skip)('Linux/Docker 마운트 경로', () => {
    /**
     * 📌 테스트 시나리오: Linux에서 유효한 마운트 경로로 용량 조회
     *
     * 🎯 검증 목적:
     *   Linux 환경에서 /tmp 같은 유효 경로로 df 명령어가 정상 동작하는지 확인
     *
     * ✅ 기대 결과:
     *   - status = 'healthy' (또는 'degraded' if slow)
     *   - capacity 정보 포함
     */
    it('should return healthy with capacity for valid Linux mount path', async () => {
      configService.get.mockReturnValue('/tmp');
      const result = await service.checkHealth();

      expect(result.status).not.toBe('unhealthy');
      expect(result.checkedAt).toBeInstanceOf(Date);
      expect(result.capacity).toBeDefined();
      expect(result.capacity!.totalBytes).toBeGreaterThan(0);
      expect(result.capacity!.freeBytes).toBeGreaterThanOrEqual(0);
      expect(result.capacity!.usedBytes).toBeGreaterThanOrEqual(0);
    });

    /**
     * 📌 테스트 시나리오: 존재하지 않는 Linux 경로
     *
     * 🎯 검증 목적:
     *   접근 불가능한 경로일 때 unhealthy를 반환해야 한다.
     */
    it('should return unhealthy for non-existent Linux path', async () => {
      configService.get.mockReturnValue('/nonexistent/path/to/nas');
      const result = await service.checkHealth();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBeDefined();
    });

    /**
     * 📌 테스트 시나리오: Docker 스타일 마운트 경로 (/data/nas)
     *
     * 🎯 검증 목적:
     *   Docker compose에서 설정하는 /data/nas 형태의 경로를 올바르게 처리
     */
    it('should handle Docker-style mount path like /data/nas', async () => {
      configService.get.mockReturnValue('/data/nas');
      const result = await service.checkHealth();

      // /data/nas가 실제로 마운트되어 있지 않으면 unhealthy
      // 하지만 에러가 powershell ENOENT가 아니어야 함
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
      if (result.error) {
        expect(result.error).not.toContain('powershell');
        expect(result.error).not.toContain('ENOENT');
      }
    });
  });
});
