export enum PermissionEnum {
  // User Management
  USER_READ = 'USER_READ',
  USER_WRITE = 'USER_WRITE',

  // Role Management
  ROLE_READ = 'ROLE_READ',
  ROLE_WRITE = 'ROLE_WRITE',

  // File Management
  FILE_READ = 'FILE_READ',
  FILE_WRITE = 'FILE_WRITE',
  FILE_DELETE = 'FILE_DELETE',

  // File Share Management
  FILE_SHARE_CREATE = 'FILE_SHARE_CREATE',
  FILE_SHARE_READ = 'FILE_SHARE_READ',
  FILE_SHARE_DELETE = 'FILE_SHARE_DELETE',

  // File Share Request Management (NEW)
  FILE_SHARE_DIRECT = 'FILE_SHARE_DIRECT',     // 공유 직접 생성 (자동승인)
  FILE_SHARE_REQUEST = 'FILE_SHARE_REQUEST',    // 공유 요청 (승인 필요)

  // Folder Management
  FOLDER_READ = 'FOLDER_READ',
  FOLDER_WRITE = 'FOLDER_WRITE',
  FOLDER_DELETE = 'FOLDER_DELETE',

  // Admin Operations
  ADMIN = 'ADMIN',
}


/**
 * 권한별 한글 설명
 */
export const PermissionDescriptions: Record<PermissionEnum, string> = {
  [PermissionEnum.USER_READ]: '사용자 조회',
  [PermissionEnum.USER_WRITE]: '사용자 생성/수정',
  [PermissionEnum.ROLE_READ]: '역할 조회',
  [PermissionEnum.ROLE_WRITE]: '역할 생성/수정',
  [PermissionEnum.FILE_READ]: '파일 조회',
  [PermissionEnum.FILE_WRITE]: '파일 생성/수정',
  [PermissionEnum.FILE_DELETE]: '파일 삭제',
  [PermissionEnum.FILE_SHARE_CREATE]: '파일 공유 생성',
  [PermissionEnum.FILE_SHARE_READ]: '파일 공유 조회',
  [PermissionEnum.FILE_SHARE_DELETE]: '파일 공유 삭제',
  [PermissionEnum.FILE_SHARE_DIRECT]: '파일 공유 직접 생성 (자동승인)',
  [PermissionEnum.FILE_SHARE_REQUEST]: '파일 공유 요청 (승인 필요)',
  [PermissionEnum.FOLDER_READ]: '폴더 조회',
  [PermissionEnum.FOLDER_WRITE]: '폴더 생성/수정',
  [PermissionEnum.FOLDER_DELETE]: '폴더 삭제',
  [PermissionEnum.ADMIN]: '관리자',
};
