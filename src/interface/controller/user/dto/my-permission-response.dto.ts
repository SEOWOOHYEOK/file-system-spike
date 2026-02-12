import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../../domain/role/entities/role.entity';
import {
  PermissionEnum,
  PermissionDescriptions,
} from '../../../../domain/role/permission.enum';

/**
 * 개별 권한 항목 DTO
 */
export class PermissionItemDto {
  @ApiProperty({ description: '권한 코드', example: 'FILE_SHARE_DIRECT' })
  code: string;

  @ApiProperty({
    description: '권한 설명 (한글)',
    example: '파일 공유 직접 생성 (자동승인)',
  })
  description: string;
}

/**
 * 카테고리별 권한 그룹 DTO
 */
export class PermissionGroupDto {
  @ApiProperty({ description: '카테고리명', example: 'File Share Management' })
  category: string;

  @ApiProperty({
    description: '해당 카테고리의 권한 목록',
    type: [PermissionItemDto],
  })
  permissions: PermissionItemDto[];
}

/**
 * 나의 권한 조회 응답 DTO
 */
export class MyPermissionResponseDto {
  @ApiProperty({ description: '역할 ID', example: '550e8400-e29b-41d4-a716-446655440001' })
  roleId: string;

  @ApiProperty({ description: '역할명', example: 'MANAGER' })
  roleName: string;

  @ApiProperty({ description: '역할 설명', example: '매니저' })
  roleDescription: string;

  @ApiProperty({
    description: '보유 권한 코드 목록 (플랫)',
    type: [String],
    example: ['FILE_READ', 'FILE_SHARE_DIRECT', 'FILE_SHARE_REQUEST'],
  })
  permissions: string[];

  @ApiProperty({
    description: '카테고리별 권한 그룹',
    type: [PermissionGroupDto],
  })
  permissionGroups: PermissionGroupDto[];

  /**
   * Role 엔티티로부터 응답 DTO 생성
   */
  static fromRole(role: Role): MyPermissionResponseDto {
    const dto = new MyPermissionResponseDto();
    dto.roleId = role.id;
    dto.roleName = role.name;
    dto.roleDescription = role.description ?? '';

    // 플랫 권한 코드 목록
    const permissionCodes = role.permissions.map((p) => p.code);
    dto.permissions = permissionCodes;

    // 카테고리별 그룹핑
    dto.permissionGroups = MyPermissionResponseDto.groupByCategory(permissionCodes);

    return dto;
  }

  /**
   * 권한 코드를 카테고리별로 그룹핑
   */
  private static groupByCategory(codes: string[]): PermissionGroupDto[] {
    const categoryMap: Record<string, { prefix: string; label: string }> = {
      USER_: { prefix: 'USER_', label: 'User Management' },
      ROLE_: { prefix: 'ROLE_', label: 'Role Management' },
      AUDIT_: { prefix: 'AUDIT_', label: 'Audit & Monitoring' },
      SYSTEM_: { prefix: 'SYSTEM_', label: 'System & Monitoring' },
      SYNC_: { prefix: 'SYNC_', label: 'System & Monitoring' },
      FILE_SHARE_: { prefix: 'FILE_SHARE_', label: 'File Share Management' },
      FILE_MOVE_: { prefix: 'FILE_MOVE_', label: 'File Request/Approval Workflow' },
      FILE_DELETE_: { prefix: 'FILE_DELETE_', label: 'File Request/Approval Workflow' },
      FILE_: { prefix: 'FILE_', label: 'File Management' },
      TRASH_: { prefix: 'TRASH_', label: 'Trash & Recovery' },
      SHARE_LOG_: { prefix: 'SHARE_LOG_', label: 'File Share Management' },
      EXTERNAL_SHARE_: { prefix: 'EXTERNAL_SHARE_', label: 'External Share Access' },
      FOLDER_: { prefix: 'FOLDER_', label: 'Folder Management' },
    };

    // 가장 긴 prefix부터 매칭 (FILE_SHARE_ 가 FILE_ 보다 먼저)
    const sortedPrefixes = Object.keys(categoryMap).sort(
      (a, b) => b.length - a.length,
    );

    const groups = new Map<string, PermissionItemDto[]>();

    for (const code of codes) {
      const matched = sortedPrefixes.find((prefix) => code.startsWith(prefix));
      const label = matched ? categoryMap[matched].label : 'Others';

      if (!groups.has(label)) {
        groups.set(label, []);
      }

      const description =
        PermissionDescriptions[code as PermissionEnum] ?? code;
      groups.get(label)!.push({ code, description });
    }

    return Array.from(groups.entries()).map(([category, permissions]) => ({
      category,
      permissions,
    }));
  }
}
