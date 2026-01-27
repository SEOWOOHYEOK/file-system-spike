import { Test, TestingModule } from '@nestjs/testing';
import { PermissionSyncService } from './permission-sync.service';
import { PERMISSION_REPOSITORY, IPermissionRepository } from '../../domain/role/repositories/permission.repository.interface';
import { PermissionEnum } from '../../domain/role/permission.enum';
import { Permission } from '../../domain/role/entities/permission.entity';

/**
 * ============================================================
 * 📦 PermissionSyncService 테스트
 * ============================================================
 * 
 * 🎯 테스트 대상:
 *   - PermissionSyncService
 *   
 * 📋 비즈니스 맥락:
 *   - 서버가 시작될 때 코드에 정의된 권한(PermissionEnum)들이
 *     DB에도 동기화되어 있어야 관리자가 역할을 구성할 수 있음.
 * 
 * ⚠️ 중요 고려사항:
 *   - 이미 DB에 존재하는 권한은 중복해서 생성하면 안 됨.
 *   - Enum에 정의된 모든 권한이 빠짐없이 저장되어야 함.
 * ============================================================
 */
describe('PermissionSyncService', () => {
  let service: PermissionSyncService;
  let permissionRepo: jest.Mocked<IPermissionRepository>;

  beforeEach(async () => {
    const mockPermissionRepo = {
      findByCode: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionSyncService,
        {
          provide: PERMISSION_REPOSITORY,
          useValue: mockPermissionRepo,
        },
      ],
    }).compile();

    service = module.get<PermissionSyncService>(PermissionSyncService);
    permissionRepo = module.get(PERMISSION_REPOSITORY);
  });

  /**
   * 📌 테스트 시나리오: 초기 실행 시 모든 권한 동기화
   * 
   * 🎯 검증 목적:
   *   - DB가 비어있을 때 Enum의 모든 권한이 저장되는지 확인
   * 
   * ✅ 기대 결과:
   *   - PermissionEnum의 개수만큼 save가 호출되어야 함
   */
  it('should sync all permissions when db is empty', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    // 모든 findByCode 호출에 대해 null(없음) 반환
    permissionRepo.findByCode.mockResolvedValue(null);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    await service.onModuleInit();

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    const enumCount = Object.keys(PermissionEnum).length;
    expect(permissionRepo.save).toHaveBeenCalledTimes(enumCount);
  });

  /**
   * 📌 테스트 시나리오: 이미 존재하는 권한은 건너뛰기
   * 
   * 🎯 검증 목적:
   *   - 이미 DB에 있는 권한을 중복 저장하지 않는지 확인 (성능 및 정합성)
   * 
   * ✅ 기대 결과:
   *   - 이미 존재하는 권한에 대해서는 save가 호출되지 않아야 함
   */
  it('should skip existing permissions', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    // 모든 권한이 이미 존재한다고 가정
    permissionRepo.findByCode.mockResolvedValue(new Permission({ code: 'SOME_CODE' }));

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    await service.onModuleInit();

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(permissionRepo.save).not.toHaveBeenCalled();
  });
});
