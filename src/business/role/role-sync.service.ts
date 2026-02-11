import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RoleNameEnum, RoleDescriptions } from '../../domain/role/role-name.enum';
import { PermissionEnum } from '../../domain/role/permission.enum';
import { Role } from '../../domain/role/entities/role.entity';
import { v4 as uuidv4 } from 'uuid';

import { RoleDomainService, PermissionDomainService } from '../../domain/role';

/**
 * 역할별 기본 권한 매핑
 *
 * CSV "역할별 가능기능" 기준으로 매핑
 * - Admin  : 모든 권한
 * - Manager: 관리자 전용(감사, 시스템 설정, 사용자/역할 관리) 제외 전체
 * - User   : 조회 + 업로드/다운로드 + 요청(승인 제외) + 외부 공유 접근
 * - Guest  : 외부 공유 접근만
 */
const RolePermissions: Record<RoleNameEnum, PermissionEnum[]> = {
  // ── Admin: 모든 권한 ─────────────────────────────
  [RoleNameEnum.ADMIN]: Object.values(PermissionEnum),

  // ── Manager ──────────────────────────────────────
  // CSV 기준: 관리자 전용(AUDIT_READ, AUDIT_EXPORT, SYSTEM_CONFIG,
  //   SYNC_MANAGE, USER_READ/WRITE, ROLE_READ/WRITE, ADMIN) 제외 전체
  [RoleNameEnum.MANAGER]: [
    // Monitoring
    PermissionEnum.SYSTEM_MONITOR,

    // Folder
    PermissionEnum.FOLDER_READ,
    PermissionEnum.FOLDER_WRITE,
    PermissionEnum.FOLDER_DELETE,

    // File - 기본
    PermissionEnum.FILE_READ,
    PermissionEnum.FILE_WRITE,
    PermissionEnum.FILE_DELETE,
    PermissionEnum.FILE_UPLOAD,
    PermissionEnum.FILE_DOWNLOAD,
    PermissionEnum.FILE_MOVE,

    // File - 요청/승인 워크플로우
    PermissionEnum.FILE_MOVE_REQUEST,
    PermissionEnum.FILE_MOVE_APPROVE,
    PermissionEnum.FILE_DELETE_REQUEST,
    PermissionEnum.FILE_DELETE_APPROVE,

    // 삭제/복구
    PermissionEnum.TRASH_READ,
    PermissionEnum.FILE_PURGE,
    PermissionEnum.FILE_RESTORE,

    // 공유
    PermissionEnum.FILE_SHARE_CREATE,
    PermissionEnum.FILE_SHARE_READ,
    PermissionEnum.FILE_SHARE_DELETE,
    PermissionEnum.FILE_SHARE_DIRECT,
    PermissionEnum.FILE_SHARE_REQUEST,
    PermissionEnum.FILE_SHARE_APPROVE,
    PermissionEnum.SHARE_LOG_READ,
    PermissionEnum.EXTERNAL_SHARE_ACCESS,
  ],

  // ── User ─────────────────────────────────────────
  // CSV 기준: 조회 + 업로드/다운로드 + 요청(승인 불가) + 외부 공유 접근
  [RoleNameEnum.USER]: [
    // Monitoring
    PermissionEnum.SYSTEM_MONITOR,

    // Folder (조회만)
    PermissionEnum.FOLDER_READ,

    // File - 조회/업로드/다운로드
    PermissionEnum.FILE_READ,
    PermissionEnum.FILE_UPLOAD,
    PermissionEnum.FILE_DOWNLOAD,

    // File - 요청만 (직접 이동/삭제 불가, 승인 불가)
    PermissionEnum.FILE_MOVE_REQUEST,
    PermissionEnum.FILE_DELETE_REQUEST,

    // 공유 - 요청/조회만
    PermissionEnum.FILE_SHARE_READ,
    PermissionEnum.FILE_SHARE_REQUEST,
    PermissionEnum.EXTERNAL_SHARE_ACCESS,
  ],

  // ── Guest ────────────────────────────────────────
  // CSV 기준: 공유 파일 정보 조회/뷰어/다운로드/재요청만 가능
  [RoleNameEnum.GUEST]: [
    PermissionEnum.EXTERNAL_SHARE_ACCESS,
  ],
};

/**
 * Role 자동 동기화 서비스
 *
 * 앱 시작 시 RoleNameEnum에 정의된 역할들을 DB에 자동 생성
 */
@Injectable()
export class RoleSyncService implements OnModuleInit {
  private readonly logger = new Logger(RoleSyncService.name);


  constructor(
    private readonly roleDomainService: RoleDomainService,
    private readonly permissionDomainService: PermissionDomainService,
  ) {}

  async onModuleInit() {
    this.logger.log('역할 동기화 시작...');

    for (const roleName of Object.values(RoleNameEnum)) {
      await this.syncRole(roleName);
    }

    this.logger.log('역할 동기화 완료');
  }

  private async syncRole(roleName: RoleNameEnum): Promise<void> {
    const existing = await this.roleDomainService.이름조회(roleName);

    if (existing) {
      this.logger.debug(`역할 ${roleName} 이미 존재함, 스킵`);
      return;
    }

  
    // 해당 역할의 권한들 조회
    const permissionCodes = RolePermissions[roleName];
    const permissions = await Promise.all(
      permissionCodes.map((code) => this.permissionDomainService.코드조회(code)),
    );

    const validPermissions = permissions.filter((p) => p !== null);

    const role = new Role({
      id: uuidv4(),
      name: roleName,
      description: RoleDescriptions[roleName],
      permissions: validPermissions,
    });

    await this.roleDomainService.저장(role);
    this.logger.log(`역할 생성됨: ${roleName} (권한 ${validPermissions.length}개)`);
  }
}
