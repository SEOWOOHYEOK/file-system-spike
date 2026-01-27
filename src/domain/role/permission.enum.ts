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

  // File Share Management (for upcoming file share system)
  FILE_SHARE_CREATE = 'FILE_SHARE_CREATE',
  FILE_SHARE_READ = 'FILE_SHARE_READ',
  FILE_SHARE_DELETE = 'FILE_SHARE_DELETE',

  // Folder Management
  FOLDER_READ = 'FOLDER_READ',
  FOLDER_WRITE = 'FOLDER_WRITE',
  FOLDER_DELETE = 'FOLDER_DELETE',

  // Admin Operations
  ADMIN = 'ADMIN',
}
