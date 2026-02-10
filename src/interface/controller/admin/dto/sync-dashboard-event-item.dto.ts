import { ApiProperty } from '@nestjs/swagger';

export class RequesterInfoDto {
  @ApiProperty({ description: '사용자 ID' })
  userId: string;

  @ApiProperty({ description: '이름' })
  name: string;

  @ApiProperty({ description: '부서', nullable: true })
  department: string | null;

  static from(
    employee: { id: string; name: string; departmentName?: string | null } | null,
    userId: string,
  ): RequesterInfoDto {
    const dto = new RequesterInfoDto();
    dto.userId = userId;
    dto.name = employee?.name ?? 'Unknown';
    dto.department = employee?.departmentName ?? null;
    return dto;
  }
}

export class SyncDashboardEventItemDto {
  @ApiProperty({ description: '이벤트 ID' })
  id: string;

  @ApiProperty({ description: '동기화 상태 (PENDING/QUEUED/PROCESSING/RETRYING/DONE/FAILED)' })
  status: string;

  @ApiProperty({ description: '이벤트 타입 (CREATE/MOVE/RENAME/TRASH/RESTORE/PURGE)' })
  eventType: string;

  @ApiProperty({ description: '대상 타입 (FILE/FOLDER)' })
  targetType: string;

  @ApiProperty({ description: '파일 ID', nullable: true })
  fileId: string | null;

  @ApiProperty({ description: '폴더 ID', nullable: true })
  folderId: string | null;

  @ApiProperty({ description: '파일/폴더 이름' })
  fileName: string;

  @ApiProperty({ description: '대상 경로' })
  filePath: string;

  @ApiProperty({ description: '파일 크기 (bytes)', nullable: true })
  fileSize: number | null;

  @ApiProperty({ description: '포맷된 파일 크기', nullable: true })
  fileSizeFormatted: string | null;

  @ApiProperty({ description: '처리 완료 시각', nullable: true })
  completedAt: Date | null;

  @ApiProperty({ description: '소요 시간 (초)', nullable: true })
  duration: number | null;

  @ApiProperty({ description: '재시도 횟수' })
  retryCount: number;

  @ApiProperty({ description: '최대 재시도 횟수' })
  maxRetries: number;

  @ApiProperty({ description: '요청자 정보', type: RequesterInfoDto })
  requester: RequesterInfoDto;

  @ApiProperty({ description: '에러 메시지', nullable: true })
  errorMessage: string | null;

  @ApiProperty({ description: 'stuck 상태 여부' })
  isStuck: boolean;

  @ApiProperty({ description: '생성 시각' })
  createdAt: Date;

  @ApiProperty({ description: '수정 시각' })
  updatedAt: Date;

  static from(
    syncEvent: {
      id: string;
      status: string;
      eventType: string;
      targetType: string;
      fileId?: string;
      folderId?: string;
      targetPath: string;
      processedAt?: Date;
      createdAt: Date;
      updatedAt: Date;
      retryCount: number;
      maxRetries: number;
      errorMessage?: string;
      processBy: string;
      metadata?: Record<string, any>;
    },
    file: { name: string; sizeBytes: number } | null,
    employee: { id: string; name: string; departmentName?: string | null } | null,
    isStuck: boolean,
  ): SyncDashboardEventItemDto {
    const dto = new SyncDashboardEventItemDto();
    dto.id = syncEvent.id;
    dto.status = syncEvent.status;
    dto.eventType = syncEvent.eventType;
    dto.targetType = syncEvent.targetType;
    dto.fileId = syncEvent.fileId ?? null;
    dto.folderId = syncEvent.folderId ?? null;

    // 파일/폴더 이름: file 엔티티에서 가져오거나, metadata.fileName / metadata.folderName 활용
    dto.fileName =
      file?.name ??
      syncEvent.metadata?.fileName ??
      syncEvent.metadata?.folderName ??
      syncEvent.metadata?.newName ??
      SyncDashboardEventItemDto.extractNameFromPath(syncEvent.targetPath);
    dto.filePath = syncEvent.targetPath;

    // 파일 크기 (FILE 타입만)
    if (syncEvent.targetType === 'FILE' && file) {
      dto.fileSize = file.sizeBytes;
      dto.fileSizeFormatted = SyncDashboardEventItemDto.formatBytes(file.sizeBytes);
    } else {
      dto.fileSize = null;
      dto.fileSizeFormatted = null;
    }

    // 처리 정보
    dto.completedAt = syncEvent.processedAt ?? null;
    dto.duration = syncEvent.processedAt
      ? Math.round((syncEvent.processedAt.getTime() - syncEvent.createdAt.getTime()) / 1000)
      : null;
    dto.retryCount = syncEvent.retryCount;
    dto.maxRetries = syncEvent.maxRetries;

    // 요청자 정보
    dto.requester = RequesterInfoDto.from(employee, syncEvent.processBy);

    // 에러/비고
    dto.errorMessage = syncEvent.errorMessage ?? null;
    dto.isStuck = isStuck;

    // 시간
    dto.createdAt = syncEvent.createdAt;
    dto.updatedAt = syncEvent.updatedAt;

    return dto;
  }

  private static extractNameFromPath(path: string): string {
    if (!path) return 'Unknown';
    const parts = path.split('/');
    return parts[parts.length - 1] || 'Unknown';
  }

  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
  }
}
