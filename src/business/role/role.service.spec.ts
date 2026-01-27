import { Test, TestingModule } from '@nestjs/testing';
import { RoleService } from './role.service';
import { ROLE_REPOSITORY, IRoleRepository } from '../../domain/role/repositories/role.repository.interface';
import { PERMISSION_REPOSITORY, IPermissionRepository } from '../../domain/role/repositories/permission.repository.interface';
import { CreateRoleDto } from '../../domain/role/dto/create-role.dto';
import { Role } from '../../domain/role/entities/role.entity';
import { Permission } from '../../domain/role/entities/permission.entity';
import { PermissionEnum } from '../../domain/role/permission.enum';
import { ConflictException, NotFoundException } from '@nestjs/common';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

/**
 * ============================================================
 * 📦 RoleService 테스트
 * ============================================================
 * 
 * 🎯 테스트 대상:
 *   - RoleService (역할 관리 비즈니스 로직)
 *   
 * 📋 비즈니스 맥락:
 *   - 관리자는 역할을 생성, 조회, 삭제할 수 있어야 함.
 *   - 역할 생성 시 권한 목록을 함께 지정함.
 *   - 유저의 권한을 조회할 때는 할당된 모든 역할의 권한을 합쳐서 반환해야 함.
 * 
 * ⚠️ 중요 고려사항:
 *   - 역할 이름은 중복될 수 없음.
 *   - 존재하지 않는 역할 조회 시 적절한 에러 발생.
 * ============================================================
 */
describe('RoleService', () => {
  let service: RoleService;
  let roleRepo: jest.Mocked<IRoleRepository>;
  let permRepo: jest.Mocked<IPermissionRepository>;

  beforeEach(async () => {
    const mockRoleRepo = {
      save: jest.fn(),
      findByName: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      findByUserId: jest.fn(), // 추가된 인터페이스 메서드
    };

    const mockPermRepo = {
      findByCodes: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleService,
        {
          provide: ROLE_REPOSITORY,
          useValue: mockRoleRepo,
        },
        {
          provide: PERMISSION_REPOSITORY,
          useValue: mockPermRepo,
        },
      ],
    }).compile();

    service = module.get<RoleService>(RoleService);
    roleRepo = module.get(ROLE_REPOSITORY);
    permRepo = module.get(PERMISSION_REPOSITORY);
  });

  /**
   * 📌 테스트 시나리오: 역할 생성 성공
   * 
   * 🎯 검증 목적:
   *   - 중복되지 않은 이름으로 역할 생성 시 정상적으로 저장되는지 확인
   *   - 요청한 권한 코드들이 실제 Permission 객체로 변환되어 할당되는지 확인
   * 
   * ✅ 기대 결과:
   *   - roleRepo.save가 호출되어야 함
   *   - 반환된 역할 객체에 요청한 권한이 포함되어야 함
   */
  it('should create a role successfully', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const dto: CreateRoleDto = {
      name: 'Admin',
      description: 'Administrator role',
      permissionCodes: [PermissionEnum.USER_READ],
    };

    const permissions = [new Permission({ code: PermissionEnum.USER_READ })];
    
    roleRepo.findByName.mockResolvedValue(null); // 중복 없음
    permRepo.findByCodes.mockResolvedValue(permissions);
    roleRepo.save.mockImplementation(async (role) => role);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.createRole(dto);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result.name).toBe(dto.name);
    expect(result.permissions).toHaveLength(1);
    expect(result.permissions[0].code).toBe(PermissionEnum.USER_READ);
    expect(roleRepo.save).toHaveBeenCalled();
  });

  /**
   * 📌 테스트 시나리오: 역할 이름 중복 시 실패
   * 
   * 🎯 검증 목적:
   *   - 이미 존재하는 역할 이름으로 생성 시도 시 ConflictException 발생 확인
   * 
   * ✅ 기대 결과:
   *   - ConflictException 발생
   */
  it('should throw ConflictException if role name exists', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const dto: CreateRoleDto = {
      name: 'Admin',
      permissionCodes: [],
    };

    roleRepo.findByName.mockResolvedValue(new Role({ name: 'Admin' }));

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN & ✅ THEN (실행 및 검증)
    // ═══════════════════════════════════════════════════════
    await expect(service.createRole(dto)).rejects.toThrow(ConflictException);
  });

  /**
   * 📌 테스트 시나리오: 유저 권한 조회 (권한 합집합)
   * 
   * 🎯 검증 목적:
   *   - 유저가 여러 역할을 가질 때, 중복된 권한은 제거되고 합쳐진 권한 목록이 반환되는지 확인
   * 
   * ✅ 기대 결과:
   *   - [A, B] 역할이 각각 [READ], [READ, WRITE] 권한을 가질 때 -> [READ, WRITE] 반환
   */
  it('should return unique permissions from all user roles', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const userId = 'user-1';
    const role1 = new Role({
      permissions: [new Permission({ code: PermissionEnum.USER_READ })],
    });
    const role2 = new Role({
      permissions: [
        new Permission({ code: PermissionEnum.USER_READ }), // 중복
        new Permission({ code: PermissionEnum.USER_UPDATE }),
      ],
    });

    // @ts-ignore: mock definition
    roleRepo.findByUserId.mockResolvedValue([role1, role2]);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const permissions = await service.getUserPermissions(userId);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(permissions).toHaveLength(2);
    expect(permissions).toContain(PermissionEnum.USER_READ);
    expect(permissions).toContain(PermissionEnum.USER_UPDATE);
  });
});
