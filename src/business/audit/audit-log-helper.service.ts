import { Injectable } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { FileHistoryService } from './file-history.service';
import { AuditAction } from '../../domain/audit/enums/audit-action.enum';
import { AuditLogMetadata } from '../../domain/audit/entities/audit-log.entity';
import {
  UserType,
  TargetType,
  Sensitivity,
} from '../../domain/audit/enums/common.enum';
import { RequestContext } from '../../common/context/request-context';
import { LogResult } from '../../domain/audit/enums/common.enum';

/**
 * 기본 로그 파라미터 인터페이스
 */
export interface BaseLogParams {
  userId: string;
  userType: UserType;
  userName?: string;
  userEmail?: string;
}

/**
 * 파일 로그 파라미터 인터페이스
 */
export interface FileLogParams extends BaseLogParams {
  fileId: string;
  fileName?: string;
  filePath?: string;
  fileSize?: number;
  mimeType?: string;
  ownerId?: string;
  sensitivity?: Sensitivity;
}

/**
 * 폴더 로그 파라미터 인터페이스
 */
export interface FolderLogParams extends BaseLogParams {
  folderId: string;
  folderName?: string;
  folderPath?: string;
  ownerId?: string;
}

/**
 * 공유 로그 파라미터 인터페이스
 */
export interface ShareLogParams extends BaseLogParams {
  shareId: string;
  shareName?: string;
  fileId?: string;
  expiresAt?: Date;
}

/**
 * AuditLogHelper
 *
 * 서비스에서 쉽게 감사 로그를 남길 수 있는 헬퍼 서비스
 * - RequestContext에서 자동으로 컨텍스트 정보 추출
 * - 파일/폴더/공유 각각에 특화된 메서드 제공
 */
@Injectable()
export class AuditLogHelper {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly fileHistoryService: FileHistoryService,
  ) {}

  // ========== 파일 관련 로그 ==========

  /**
   * 파일 업로드 로그
   */
  async logFileUpload(params: FileLogParams): Promise<void> {
    await this.logFileAction(AuditAction.FILE_UPLOAD, params, {
      fileSize: params.fileSize,
      mimeType: params.mimeType,
    });

    // 파일 이력 기록
    if (params.fileId && params.fileName) {
      await this.fileHistoryService.logFileCreated({
        fileId: params.fileId,
        changedBy: params.userId,
        userType: params.userType,
        name: params.fileName,
        size: params.fileSize || 0,
        mimeType: params.mimeType || 'application/octet-stream',
        path: params.filePath || '/',
      });
    }
  }

  /**
   * 파일 다운로드 로그
   */
  async logFileDownload(params: FileLogParams): Promise<void> {
    await this.logFileAction(AuditAction.FILE_DOWNLOAD, params, {
      fileSize: params.fileSize,
      mimeType: params.mimeType,
    });
  }

  /**
   * 파일 조회 로그
   */
  async logFileView(params: FileLogParams): Promise<void> {
    await this.logFileAction(AuditAction.FILE_VIEW, params);
  }

  /**
   * 파일 이름 변경 로그
   */
  async logFileRename(
    params: FileLogParams & { previousName: string; newName: string },
  ): Promise<void> {
    await this.logFileAction(AuditAction.FILE_RENAME, params, {
      previousName: params.previousName,
      newName: params.newName,
    });

    // 파일 이력 기록
    await this.fileHistoryService.logFileRenamed({
      fileId: params.fileId,
      changedBy: params.userId,
      userType: params.userType,
      previousName: params.previousName,
      newName: params.newName,
    });
  }

  /**
   * 파일 이동 로그
   */
  async logFileMove(
    params: FileLogParams & {
      previousFolderId: string;
      previousPath: string;
      newFolderId: string;
      newPath: string;
    },
  ): Promise<void> {
    await this.logFileAction(AuditAction.FILE_MOVE, params, {
      previousFolderId: params.previousFolderId,
      previousPath: params.previousPath,
      newFolderId: params.newFolderId,
      newPath: params.newPath,
    });

    // 파일 이력 기록
    await this.fileHistoryService.logFileMoved({
      fileId: params.fileId,
      changedBy: params.userId,
      userType: params.userType,
      previousFolderId: params.previousFolderId,
      previousPath: params.previousPath,
      newFolderId: params.newFolderId,
      newPath: params.newPath,
    });
  }


  /**
   * 파일 삭제 (휴지통 이동) 로그
   */
  async logFileDelete(params: FileLogParams): Promise<void> {
    await this.logFileAction(AuditAction.FILE_DELETE, params);

    // 파일 이력 기록
    if (params.fileId && params.fileName) {
      await this.fileHistoryService.logFileTrashed({
        fileId: params.fileId,
        changedBy: params.userId,
        userType: params.userType,
        fileName: params.fileName,
        originalPath: params.filePath || '/',
      });
    }
  }

  /**
   * 파일 복원 로그
   */
  async logFileRestore(params: FileLogParams): Promise<void> {
    await this.logFileAction(AuditAction.FILE_RESTORE, params);

    // 파일 이력 기록
    if (params.fileId && params.fileName) {
      await this.fileHistoryService.logFileRestored({
        fileId: params.fileId,
        changedBy: params.userId,
        userType: params.userType,
        fileName: params.fileName,
        restoredPath: params.filePath || '/',
      });
    }
  }

  /**
   * 파일 영구 삭제 로그
   */
  async logFilePurge(params: FileLogParams): Promise<void> {
    await this.logFileAction(AuditAction.FILE_PURGE, params);

    // 파일 이력 기록
    if (params.fileId && params.fileName) {
      await this.fileHistoryService.logFileDeleted({
        fileId: params.fileId,
        changedBy: params.userId,
        userType: params.userType,
        fileName: params.fileName,
      });
    }
  }

  // ========== 폴더 관련 로그 ==========

  /**
   * 폴더 생성 로그
   */
  async logFolderCreate(params: FolderLogParams): Promise<void> {
    await this.logFolderAction(AuditAction.FOLDER_CREATE, params);
  }

  /**
   * 폴더 조회 로그
   */
  async logFolderView(params: FolderLogParams): Promise<void> {
    await this.logFolderAction(AuditAction.FOLDER_VIEW, params);
  }

  /**
   * 폴더 이름 변경 로그
   */
  async logFolderRename(
    params: FolderLogParams & { previousName: string; newName: string },
  ): Promise<void> {
    await this.logFolderAction(AuditAction.FOLDER_RENAME, params, {
      previousName: params.previousName,
      newName: params.newName,
    });
  }

  /**
   * 폴더 이동 로그
   */
  async logFolderMove(
    params: FolderLogParams & {
      previousParentId: string;
      previousPath: string;
      newParentId: string;
      newPath: string;
    },
  ): Promise<void> {
    await this.logFolderAction(AuditAction.FOLDER_MOVE, params, {
      previousParentId: params.previousParentId,
      previousPath: params.previousPath,
      newParentId: params.newParentId,
      newPath: params.newPath,
    });
  }

  /**
   * 폴더 삭제 로그
   */
  async logFolderDelete(params: FolderLogParams): Promise<void> {
    await this.logFolderAction(AuditAction.FOLDER_DELETE, params);
  }

  // ========== 공유 관련 로그 ==========

  /**
   * 공유 링크 생성 로그
   */
  async logShareCreate(params: ShareLogParams): Promise<void> {
    await this.logShareAction(AuditAction.SHARE_CREATE, params, {
      fileId: params.fileId,
      expiresAt: params.expiresAt ? new Date(params.expiresAt) : undefined,
    });
  }

  /**
   * 공유 링크 해제 로그
   */
  async logShareRevoke(params: ShareLogParams): Promise<void> {
    await this.logShareAction(AuditAction.SHARE_REVOKE, params);
  }

  /**
   * 공유 링크 접근 로그
   */
  async logShareAccess(params: ShareLogParams): Promise<void> {
    await this.logShareAction(AuditAction.SHARE_ACCESS, params);
  }

  /**
   * 공유 링크 차단 로그
   */
  async logShareBlock(params: ShareLogParams): Promise<void> {
    await this.logShareAction(AuditAction.SHARE_BLOCK, params);
  }

  // ========== 휴지통 관련 로그 ==========

  /**
   * 휴지통 비우기 로그
   */
  async logTrashEmpty(params: BaseLogParams & { deletedCount: number }): Promise<void> {
    const ctx = RequestContext.get();
    await this.auditLogService.log({
      requestId: ctx?.requestId || 'unknown',
      sessionId: ctx?.sessionId,
      traceId: ctx?.traceId,
      userId: params.userId,
      userType: params.userType,
      userName: params.userName,
      userEmail: params.userEmail,
      action: AuditAction.TRASH_EMPTY,
      targetType: TargetType.FOLDER,
      targetId: 'trash',
      targetName: 'Trash',
      ipAddress: ctx?.ipAddress || 'unknown',
      userAgent: ctx?.userAgent || 'unknown',
      result: LogResult.SUCCESS,
      metadata: { deletedCount: params.deletedCount },
    });
  }

  /**
   * 휴지통 조회 로그
   */
  async logTrashView(params: BaseLogParams): Promise<void> {
    const ctx = RequestContext.get();
    await this.auditLogService.log({
      requestId: ctx?.requestId || 'unknown',
      sessionId: ctx?.sessionId,
      traceId: ctx?.traceId,
      userId: params.userId,
      userType: params.userType,
      userName: params.userName,
      userEmail: params.userEmail,
      action: AuditAction.TRASH_VIEW,
      targetType: TargetType.FOLDER,
      targetId: 'trash',
      targetName: 'Trash',
      ipAddress: ctx?.ipAddress || 'unknown',
      userAgent: ctx?.userAgent || 'unknown',
      result: LogResult.SUCCESS,
    });
  }

  // ========== 실패 로그 ==========

  /**
   * 실패 로그 기록 (범용)
   */
  async logFailure(params: {
    action: AuditAction;
    targetType: TargetType;
    targetId: string;
    targetName?: string;
    userId: string;
    userType: UserType;
    userName?: string;
    userEmail?: string;
    failReason: string;
    resultCode?: string;
  }): Promise<void> {
    const ctx = RequestContext.get();
    await this.auditLogService.logFailure({
      requestId: ctx?.requestId || 'unknown',
      sessionId: ctx?.sessionId,
      traceId: ctx?.traceId,
      userId: params.userId,
      userType: params.userType,
      userName: params.userName,
      userEmail: params.userEmail,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      targetName: params.targetName,
      ipAddress: ctx?.ipAddress || 'unknown',
      userAgent: ctx?.userAgent || 'unknown',
      failReason: params.failReason,
      resultCode: params.resultCode,
    });
  }

  // ========== Private 메서드 ==========

  private async logFileAction(
    action: AuditAction,
    params: FileLogParams,
    metadata?: AuditLogMetadata,
  ): Promise<void> {
    const ctx = RequestContext.get();
    await this.auditLogService.log({
      requestId: ctx?.requestId || 'unknown',
      sessionId: ctx?.sessionId,
      traceId: ctx?.traceId,
      userId: params.userId,
      userType: params.userType,
      userName: params.userName,
      userEmail: params.userEmail,
      action,
      targetType: TargetType.FILE,
      targetId: params.fileId,
      targetName: params.fileName,
      targetPath: params.filePath,
      sensitivity: params.sensitivity,
      ownerId: params.ownerId,
      ipAddress: ctx?.ipAddress || 'unknown',
      userAgent: ctx?.userAgent || 'unknown',
      result: LogResult.SUCCESS,
      metadata,
    });
  }

  private async logFolderAction(
    action: AuditAction,
    params: FolderLogParams,
    metadata?: AuditLogMetadata,
  ): Promise<void> {
    const ctx = RequestContext.get();
    await this.auditLogService.log({
      requestId: ctx?.requestId || 'unknown',
      sessionId: ctx?.sessionId,
      traceId: ctx?.traceId,
      userId: params.userId,
      userType: params.userType,
      userName: params.userName,
      userEmail: params.userEmail,
      action,
      targetType: TargetType.FOLDER,
      targetId: params.folderId,
      targetName: params.folderName,
      targetPath: params.folderPath,
      ownerId: params.ownerId,
      ipAddress: ctx?.ipAddress || 'unknown',
      userAgent: ctx?.userAgent || 'unknown',
      result: LogResult.SUCCESS,
      metadata,
    });
  }

  private async logShareAction(
    action: AuditAction,
    params: ShareLogParams,
    metadata?: AuditLogMetadata,
  ): Promise<void> {
    const ctx = RequestContext.get();
    await this.auditLogService.log({
      requestId: ctx?.requestId || 'unknown',
      sessionId: ctx?.sessionId,
      traceId: ctx?.traceId,
      userId: params.userId,
      userType: params.userType,
      userName: params.userName,
      userEmail: params.userEmail,
      action,
      targetType: TargetType.SHARE,
      targetId: params.shareId,
      targetName: params.shareName,
      ipAddress: ctx?.ipAddress || 'unknown',
      userAgent: ctx?.userAgent || 'unknown',
      result: LogResult.SUCCESS,
      metadata,
    });
  }
}
