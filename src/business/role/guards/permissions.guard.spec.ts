import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsGuard } from './permissions.guard';
import { RoleService } from '../role.service';
import { UserService } from '../../user/user.service';
import { Reflector } from '@nestjs/core';
import { PermissionEnum } from '../../../domain/role/permission.enum';
import { ExecutionContext } from '@nestjs/common';
import { User } from '../../../domain/user/entities/user.entity';
import { Role } from '../../../domain/role/entities/role.entity';
import { Permission } from '../../../domain/role/entities/permission.entity';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

/**
 * ============================================================
 * 📦 PermissionsGuard 테스트
 * ============================================================
 * 
 * 🎯 테스트 대상:
 *   - PermissionsGuard (API 접근 제어)
 *   
 * 📋 비즈니스 맥락:
 *   - API 엔드포인트에 @RequirePermissions 데코레이터가 붙어있을 때,
 *     요청한 유저가 해당 권한을 가지고 있는지 검사해야 함.
 *   - User 테이블 기반으로 권한 검사 (UserRole 테이블 → User.roleId 사용)
 * 
 * ⚠️ 중요 고려사항:
 *   - 데코레이터가 없는 엔드포인트는 통과시켜야 함 (Public API 등).
 *   - 로그인하지 않은 유저(request.user 없음)는 차단해야 함.
 *   - 비활성 User (isActive: false)는 차단해야 함.
 *   - roleId가 없는 User는 차단해야 함.
 * ============================================================
 */
describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let roleService: jest.Mocked<RoleService>;
  let userService: jest.Mocked<UserService>;
  let reflector: jest.Mocked<Reflector>;

  /**
   * 🎭 Mock 설정
   * 📍 mockUserService:
   *   - 실제 동작: User 테이블에서 사용자 조회
   *   - Mock 이유: DB 연결 없이 Guard 로직 테스트
   * 📍 mockRoleService:
   *   - 실제 동작: Role 테이블에서 Role + Permission 조회
   *   - Mock 이유: DB 연결 없이 Guard 로직 테스트
   */
  beforeEach(async () => {
    const mockUserService = {
      findByIdWithRole: jest.fn(),
    };

    const mockRoleService = {
      findById: jest.fn(),
    };

    const mockReflector = {
      getAllAndOverride: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        { provide: UserService, useValue: mockUserService },
        { provide: RoleService, useValue: mockRoleService },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get<PermissionsGuard>(PermissionsGuard);
    userService = module.get(UserService);
    roleService = module.get(RoleService);
    reflector = module.get(Reflector);
  });

  /**
   * Mock ExecutionContext 생성 헬퍼
   */
  const createMockContext = (user?: any) => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  /**
   * 📌 테스트 시나리오: 권한 요구사항이 없는 경우
   * 
   * 🎯 검증 목적:
   *   - @RequirePermissions 데코레이터가 없는 API는 검사를 건너뛰고 허용하는지 확인
   * 
   * ✅ 기대 결과:
   *   - true 반환
   */
  it('should return true if no permissions required', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN
    // ═══════════════════════════════════════════════════════
    reflector.getAllAndOverride.mockReturnValue(null);
    const context = createMockContext();

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN
    // ═══════════════════════════════════════════════════════
    const result = await guard.canActivate(context);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN
    // ═══════════════════════════════════════════════════════
    expect(result).toBe(true);
  });

  /**
   * 📌 테스트 시나리오: 유저 정보가 없는 경우
   * 
   * 🎯 검증 목적:
   *   - 권한이 필요한데 로그인하지 않은(request.user가 없는) 요청 차단
   * 
   * ✅ 기대 결과:
   *   - false 반환
   */
  it('should return false if user is not present', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN
    // ═══════════════════════════════════════════════════════
    reflector.getAllAndOverride.mockReturnValue([PermissionEnum.USER_READ]);
    const context = createMockContext(undefined); // No user

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN
    // ═══════════════════════════════════════════════════════
    const result = await guard.canActivate(context);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN
    // ═══════════════════════════════════════════════════════
    expect(result).toBe(false);
  });

  /**
   * 📌 테스트 시나리오: 권한 충족 (성공)
   * 
   * 🎯 검증 목적:
   *   - 활성 User가 요구된 권한을 모두 가지고 있을 때 통과하는지 확인
   * 
   * ✅ 기대 결과:
   *   - true 반환
   */
  it('should return true if user has required permissions', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN
    // ═══════════════════════════════════════════════════════
    reflector.getAllAndOverride.mockReturnValue([PermissionEnum.USER_READ]);
    const context = createMockContext({ id: 'user-1' });
    
    // 활성 User, Role 있음, 해당 권한 보유
    const user = new User({
      id: 'user-1',
      roleId: 'role-1',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const role = new Role({
      id: 'role-1',
      name: 'MANAGER',
      permissions: [
        new Permission({ id: 'p1', code: PermissionEnum.USER_READ }),
        new Permission({ id: 'p2', code: PermissionEnum.FILE_READ }),
      ],
    });

    userService.findByIdWithRole.mockResolvedValue({ user, role });

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN
    // ═══════════════════════════════════════════════════════
    const result = await guard.canActivate(context);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN
    // ═══════════════════════════════════════════════════════
    expect(result).toBe(true);
  });

  /**
   * 📌 테스트 시나리오: 권한 부족 (실패)
   * 
   * 🎯 검증 목적:
   *   - 유저가 요구된 권한을 가지고 있지 않을 때 차단하는지 확인
   * 
   * ✅ 기대 결과:
   *   - false 반환
   */
  it('should return false if user lacks required permissions', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN
    // ═══════════════════════════════════════════════════════
    reflector.getAllAndOverride.mockReturnValue([PermissionEnum.ROLE_WRITE]);
    const context = createMockContext({ id: 'user-1' });
    
    // User는 읽기 권한만 있음
    const user = new User({
      id: 'user-1',
      roleId: 'role-1',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const role = new Role({
      id: 'role-1',
      name: 'VIEWER',
      permissions: [
        new Permission({ id: 'p1', code: PermissionEnum.USER_READ }),
      ],
    });

    userService.findByIdWithRole.mockResolvedValue({ user, role });

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN
    // ═══════════════════════════════════════════════════════
    const result = await guard.canActivate(context);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN
    // ═══════════════════════════════════════════════════════
    expect(result).toBe(false);
  });

  /**
   * 📌 테스트 시나리오: 비활성 User 차단
   * 
   * 🎯 검증 목적:
   *   - isActive: false인 User는 권한이 있어도 차단해야 함
   * 
   * ✅ 기대 결과:
   *   - false 반환
   */
  it('should return false if user is inactive', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN
    // ═══════════════════════════════════════════════════════
    reflector.getAllAndOverride.mockReturnValue([PermissionEnum.USER_READ]);
    const context = createMockContext({ id: 'user-1' });
    
    // 비활성 User
    const user = new User({
      id: 'user-1',
      roleId: 'role-1',
      isActive: false, // 비활성
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const role = new Role({
      id: 'role-1',
      name: 'MANAGER',
      permissions: [
        new Permission({ id: 'p1', code: PermissionEnum.USER_READ }),
      ],
    });

    userService.findByIdWithRole.mockResolvedValue({ user, role });

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN
    // ═══════════════════════════════════════════════════════
    const result = await guard.canActivate(context);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN
    // ═══════════════════════════════════════════════════════
    expect(result).toBe(false);
  });

  /**
   * 📌 테스트 시나리오: Role 없는 User 차단
   * 
   * 🎯 검증 목적:
   *   - roleId가 null인 User는 권한 없으므로 차단
   * 
   * ✅ 기대 결과:
   *   - false 반환
   */
  it('should return false if user has no role', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN
    // ═══════════════════════════════════════════════════════
    reflector.getAllAndOverride.mockReturnValue([PermissionEnum.USER_READ]);
    const context = createMockContext({ id: 'user-1' });
    
    // Role 없는 User
    const user = new User({
      id: 'user-1',
      roleId: null, // Role 없음
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    userService.findByIdWithRole.mockResolvedValue({ user, role: null });

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN
    // ═══════════════════════════════════════════════════════
    const result = await guard.canActivate(context);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN
    // ═══════════════════════════════════════════════════════
    expect(result).toBe(false);
  });

  /**
   * 📌 테스트 시나리오: User가 존재하지 않는 경우
   * 
   * 🎯 검증 목적:
   *   - User 테이블에 없는 userId로 요청 시 차단
   * 
   * ✅ 기대 결과:
   *   - false 반환
   */
  it('should return false if user does not exist', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN
    // ═══════════════════════════════════════════════════════
    reflector.getAllAndOverride.mockReturnValue([PermissionEnum.USER_READ]);
    const context = createMockContext({ id: 'non-existent' });
    
    // User 조회 시 NotFoundException 발생
    userService.findByIdWithRole.mockRejectedValue(new Error('User not found'));

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN
    // ═══════════════════════════════════════════════════════
    const result = await guard.canActivate(context);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN
    // ═══════════════════════════════════════════════════════
    expect(result).toBe(false);
  });
});
