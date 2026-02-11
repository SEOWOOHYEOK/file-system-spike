import { FileChangeType } from '../enums/file-change.enum';
import { UserType } from '../enums/common.enum';

/**
 * 이벤트 상관관계 파라미터
 *
 * AuditLog와 FileHistory를 연결하기 위한 공통 추적 필드
 */
export interface CorrelationParams {
  /** HTTP 요청 고유 ID */
  requestId?: string;
  /** 작업 전체 추적 ID */
  traceId?: string;
}

/**
 * 파일 상태 인터페이스
 *
 * 변경 전/후 상태를 저장하는 유연한 구조
 * JSONB 컬럼으로 저장되어 확장 가능
 */
export interface FileState {
  /** 파일/폴더 이름 */
  name?: string;
  /** 파일 크기 (bytes) */
  size?: number;
  /** MIME 타입 */
  mimeType?: string;
  /** 상위 폴더 ID */
  folderId?: string;
  /** 전체 경로 */
  path?: string;
  /** 추가 커스텀 필드 허용 */
  [key: string]: unknown;
}

/**
 * 파일 이력 생성 파라미터
 *
 * FileHistory.create() 팩토리 메서드에 전달되는 파라미터
 */
export interface CreateFileHistoryParams {
  /** 대상 파일 ID */
  fileId: string;
  /** 버전 번호 (미지정 시 1) */
  version?: number;
  /** 변경 유형 */
  changeType: FileChangeType;
  /** 변경 수행자 ID */
  changedBy: string;
  /** 변경 수행자 유형 */
  userType: UserType;
  /** 변경 전 상태 (JSONB) */
  previousState?: FileState;
  /** 변경 후 상태 (JSONB) */
  newState?: FileState;
  /** 변경 전 파일 체크섬 (SHA-256) */
  checksumBefore?: string;
  /** 변경 후 파일 체크섬 (SHA-256) */
  checksumAfter?: string;
  /** 변경 요약 설명 */
  changeSummary?: string;
  /** 이 변경을 유발한 HTTP 요청 ID */
  requestId?: string;
  /** 작업 전체 추적 ID */
  traceId?: string;
  /** 이 변경을 유발한 상위 이벤트 ID */
  parentEventId?: string;
  /** 어떤 HTTP 메서드로 유발되었는지 */
  httpMethod?: string;
  /** 어떤 API 엔드포인트에서 유발되었는지 */
  apiEndpoint?: string;
  /** 구조화된 에러 코드 */
  errorCode?: string;
  /** 재시도 횟수 */
  retryCount?: number;
  /** 검색/분류용 태그 */
  tags?: string[];
  /** 인간 친화적 설명 (changeSummary를 보완/대체) */
  description?: string;
}

/**
 * FileHistory 도메인 엔티티
 *
 * 파일의 변경 이력을 버전별로 기록
 *
 * 주요 기록 대상:
 * - 파일 생성 (CREATED)
 * - 파일 내용 교체 (CONTENT_REPLACED)
 * - 파일 이름 변경 (RENAMED)
 * - 파일 이동 (MOVED)
 * - 메타데이터 변경 (METADATA_CHANGED)
 * - 휴지통 이동 (TRASHED)
 * - 복원 (RESTORED)
 * - 영구 삭제 (DELETED)
 *
 * 설계 원칙:
 * - 체크섬으로 파일 무결성 추적
 * - 파일 무결성 증명용으로 영구 보관 권장
 * - append-only (변경 불가)
 *
 * 활용 예시:
 * - "이 파일이 언제 누구에 의해 수정되었나?"
 * - "이 파일의 이전 버전은 어떤 내용이었나?"
 * - "누가 이 파일을 삭제했나?"
 */
export class FileHistory {
  // ========== 기본 필드 ==========
  /** 이력 고유 ID (UUID) */
  id: string;

  // ========== 대상 파일 정보 ==========
  /**
   * 대상 파일 ID
   * - 이력이 기록되는 파일의 고유 ID
   */
  fileId: string;

  /**
   * 버전 번호
   * - 파일 생성 시 1부터 시작
   * - 변경마다 자동 증가
   * - 버전 이력 추적에 사용
   */
  version: number;

  // ========== 변경 정보 ==========
  /**
   * 변경 유형
   * - CREATED: 파일 최초 생성
   * - CONTENT_REPLACED: 파일 내용 교체 (새 버전 업로드)
   * - RENAMED: 파일 이름 변경
   * - MOVED: 파일 위치 이동
   * - METADATA_CHANGED: 메타데이터 변경
   * - TRASHED: 휴지통으로 이동
   * - RESTORED: 휴지통에서 복원
   * - DELETED: 영구 삭제
   */
  changeType: FileChangeType;

  /**
   * 변경 수행자 ID
   * - 해당 변경을 수행한 사용자
   */
  changedBy: string;

  /**
   * 변경 수행자 유형
   * - INTERNAL: 내부 사용자
   * - EXTERNAL: 외부 사용자
   */
  userType: UserType;

  // ========== 상태 정보 (State) ==========
  /**
   * 변경 전 상태
   * - JSONB로 유연하게 저장
   * - changeType에 따라 다른 필드 포함
   *
   * 예시:
   * - RENAMED: { name: "old_name.pdf" }
   * - MOVED: { folderId: "old-folder-id", path: "/old/path/" }
   * - CONTENT_REPLACED: { size: 1048576 }
   */
  previousState?: FileState;

  /**
   * 변경 후 상태
   * - JSONB로 유연하게 저장
   * - changeType에 따라 다른 필드 포함
   *
   * 예시:
   * - CREATED: { name: "report.pdf", size: 2048, mimeType: "application/pdf", path: "/docs/" }
   * - RENAMED: { name: "new_name.pdf" }
   * - MOVED: { folderId: "new-folder-id", path: "/new/path/" }
   */
  newState?: FileState;

  // ========== 무결성 정보 (Integrity) ==========
  /**
   * 변경 전 파일 체크섬
   * - SHA-256 해시값
   * - 파일 무결성 검증에 사용
   * - CONTENT_REPLACED 시 중요
   */
  checksumBefore?: string;

  /**
   * 변경 후 파일 체크섬
   * - SHA-256 해시값
   * - 새로 생성되거나 변경된 파일의 체크섬
   */
  checksumAfter?: string;

  // ========== 설명 정보 ==========
  /**
   * 변경 요약 설명
   * - 사람이 읽을 수 있는 변경 설명
   * - 예: "이름 변경: report.pdf → 2024_report_final.pdf"
   * @deprecated description 필드로 대체 예정
   */
  changeSummary?: string;

  /**
   * 인간 친화적 설명
   * - EventDescriptionBuilder에 의해 생성된 구조화된 설명
   * - changeSummary를 보완/대체하는 필드
   * - 기본값: 빈 문자열
   */
  description: string;

  // ========== 상관관계 (신규) ==========
  /**
   * 이 변경을 유발한 HTTP 요청 ID
   * - 동일 요청에서 발생한 모든 변경을 추적
   */
  requestId?: string;

  /**
   * 작업 전체 추적 ID
   * - 분산 시스템에서 작업 추적에 사용
   * - 최대 64자
   */
  traceId?: string;

  /**
   * 이 변경을 유발한 상위 이벤트 ID
   * - 이벤트 체인 추적에 사용
   */
  parentEventId?: string;

  // ========== API 컨텍스트 (신규) ==========
  /**
   * 어떤 HTTP 메서드로 유발되었는지
   * - 예: "POST", "PUT", "DELETE"
   * - 최대 10자
   */
  httpMethod?: string;

  /**
   * 어떤 API 엔드포인트에서 유발되었는지
   * - 예: "/api/files/upload", "/api/files/:id/rename"
   * - 최대 255자
   */
  apiEndpoint?: string;

  // ========== 에러 추적 (신규) ==========
  /**
   * 구조화된 에러 코드
   * - 에러 발생 시 기록
   * - 예: "FILE_NOT_FOUND", "PERMISSION_DENIED"
   * - 최대 100자
   */
  errorCode?: string;

  // ========== 재시도 (신규) ==========
  /**
   * 재시도 횟수
   * - 실패 후 재시도한 경우 기록
   * - 기본값: 0
   */
  retryCount?: number;

  // ========== 분류 (신규) ==========
  /**
   * 검색/분류용 태그
   * - 배열 형태로 저장
   * - 예: ["urgent", "backup", "automated"]
   */
  tags?: string[];

  // ========== 시간 필드 ==========
  /**
   * 변경 발생 시각
   * - ISO 8601 형식, 밀리초 포함
   */
  createdAt: Date;

  private constructor(props: Partial<FileHistory>) {
    Object.assign(this, props);
  }

  /**
   * 파일 이력 생성 팩토리 메서드
   *
   * @param params - 이력 생성에 필요한 파라미터
   * @returns 새로운 FileHistory 인스턴스
   */
  static create(params: CreateFileHistoryParams): FileHistory {
    return new FileHistory({
      fileId: params.fileId,
      version: params.version || 1,
      changeType: params.changeType,
      changedBy: params.changedBy,
      userType: params.userType,
      previousState: params.previousState,
      newState: params.newState,
      checksumBefore: params.checksumBefore,
      checksumAfter: params.checksumAfter,
      changeSummary: params.changeSummary,
      description: params.description || '',
      requestId: params.requestId,
      traceId: params.traceId,
      parentEventId: params.parentEventId,
      httpMethod: params.httpMethod,
      apiEndpoint: params.apiEndpoint,
      errorCode: params.errorCode,
      retryCount: params.retryCount,
      tags: params.tags,
      createdAt: new Date(),
    });
  }

  /**
   * 파일 생성 이력 헬퍼
   *
   * @param params - 파일 생성 정보
   * @returns CREATED 타입의 FileHistory (version: 1)
   */
  static createForFileCreated(params: {
    /** 생성된 파일 ID */
    fileId: string;
    /** 생성자 ID */
    changedBy: string;
    /** 생성자 유형 */
    userType: UserType;
    /** 파일 이름 */
    name: string;
    /** 파일 크기 (bytes) */
    size: number;
    /** MIME 타입 */
    mimeType: string;
    /** 파일 경로 */
    path: string;
    /** 파일 체크섬 */
    checksum?: string;
  } & CorrelationParams): FileHistory {
    return FileHistory.create({
      fileId: params.fileId,
      version: 1,
      changeType: FileChangeType.CREATED,
      changedBy: params.changedBy,
      userType: params.userType,
      previousState: undefined,
      newState: {
        name: params.name,
        size: params.size,
        mimeType: params.mimeType,
        path: params.path,
      },
      checksumAfter: params.checksum,
      changeSummary: `파일 생성: ${params.name}`,
      requestId: params.requestId,
      traceId: params.traceId,
    });
  }

  /**
   * 파일 이름 변경 이력 헬퍼
   *
   * @param params - 이름 변경 정보
   * @returns RENAMED 타입의 FileHistory
   */
  static createForRenamed(params: {
    /** 파일 ID */
    fileId: string;
    /** 버전 번호 */
    version: number;
    /** 변경자 ID */
    changedBy: string;
    /** 변경자 유형 */
    userType: UserType;
    /** 이전 파일 이름 */
    previousName: string;
    /** 새 파일 이름 */
    newName: string;
  } & CorrelationParams): FileHistory {
    return FileHistory.create({
      fileId: params.fileId,
      version: params.version,
      changeType: FileChangeType.RENAMED,
      changedBy: params.changedBy,
      userType: params.userType,
      previousState: { name: params.previousName },
      newState: { name: params.newName },
      changeSummary: `이름 변경: ${params.previousName} → ${params.newName}`,
      requestId: params.requestId,
      traceId: params.traceId,
    });
  }

  /**
   * 파일 이동 이력 헬퍼
   *
   * @param params - 이동 정보
   * @returns MOVED 타입의 FileHistory
   */
  static createForMoved(params: {
    /** 파일 ID */
    fileId: string;
    /** 버전 번호 */
    version: number;
    /** 변경자 ID */
    changedBy: string;
    /** 변경자 유형 */
    userType: UserType;
    /** 이전 폴더 ID */
    previousFolderId: string;
    /** 이전 경로 */
    previousPath: string;
    /** 새 폴더 ID */
    newFolderId: string;
    /** 새 경로 */
    newPath: string;
  } & CorrelationParams): FileHistory {
    return FileHistory.create({
      fileId: params.fileId,
      version: params.version,
      changeType: FileChangeType.MOVED,
      changedBy: params.changedBy,
      userType: params.userType,
      previousState: { folderId: params.previousFolderId, path: params.previousPath },
      newState: { folderId: params.newFolderId, path: params.newPath },
      changeSummary: `위치 이동: ${params.previousPath} → ${params.newPath}`,
      requestId: params.requestId,
      traceId: params.traceId,
    });
  }

  /**
   * 파일 내용 교체 이력 헬퍼
   *
   * @param params - 내용 교체 정보
   * @returns CONTENT_REPLACED 타입의 FileHistory
   */
  static createForContentReplaced(params: {
    /** 파일 ID */
    fileId: string;
    /** 버전 번호 */
    version: number;
    /** 변경자 ID */
    changedBy: string;
    /** 변경자 유형 */
    userType: UserType;
    /** 이전 파일 크기 */
    previousSize: number;
    /** 새 파일 크기 */
    newSize: number;
    /** 이전 체크섬 */
    checksumBefore?: string;
    /** 새 체크섬 */
    checksumAfter?: string;
  } & CorrelationParams): FileHistory {
    return FileHistory.create({
      fileId: params.fileId,
      version: params.version,
      changeType: FileChangeType.CONTENT_REPLACED,
      changedBy: params.changedBy,
      userType: params.userType,
      previousState: { size: params.previousSize },
      newState: { size: params.newSize },
      checksumBefore: params.checksumBefore,
      checksumAfter: params.checksumAfter,
      changeSummary: `내용 교체: 버전 ${params.version}`,
      requestId: params.requestId,
      traceId: params.traceId,
    });
  }

  /**
   * 파일 휴지통 이동 이력 헬퍼
   *
   * @param params - 휴지통 이동 정보
   * @returns TRASHED 타입의 FileHistory
   */
  static createForTrashed(params: {
    /** 파일 ID */
    fileId: string;
    /** 버전 번호 */
    version: number;
    /** 삭제자 ID */
    changedBy: string;
    /** 삭제자 유형 */
    userType: UserType;
    /** 파일 이름 */
    fileName: string;
    /** 원래 경로 */
    originalPath: string;
  } & CorrelationParams): FileHistory {
    return FileHistory.create({
      fileId: params.fileId,
      version: params.version,
      changeType: FileChangeType.TRASHED,
      changedBy: params.changedBy,
      userType: params.userType,
      previousState: { path: params.originalPath },
      changeSummary: `휴지통 이동: ${params.fileName}`,
      requestId: params.requestId,
      traceId: params.traceId,
    });
  }

  /**
   * 파일 복원 이력 헬퍼
   *
   * @param params - 복원 정보
   * @returns RESTORED 타입의 FileHistory
   */
  static createForRestored(params: {
    /** 파일 ID */
    fileId: string;
    /** 버전 번호 */
    version: number;
    /** 복원자 ID */
    changedBy: string;
    /** 복원자 유형 */
    userType: UserType;
    /** 파일 이름 */
    fileName: string;
    /** 복원된 경로 */
    restoredPath: string;
  } & CorrelationParams): FileHistory {
    return FileHistory.create({
      fileId: params.fileId,
      version: params.version,
      changeType: FileChangeType.RESTORED,
      changedBy: params.changedBy,
      userType: params.userType,
      newState: { path: params.restoredPath },
      changeSummary: `복원됨: ${params.fileName}`,
      requestId: params.requestId,
      traceId: params.traceId,
    });
  }

  /**
   * 파일 영구 삭제 이력 헬퍼
   *
   * @param params - 영구 삭제 정보
   * @returns DELETED 타입의 FileHistory
   */
  static createForDeleted(params: {
    /** 파일 ID */
    fileId: string;
    /** 버전 번호 */
    version: number;
    /** 삭제자 ID */
    changedBy: string;
    /** 삭제자 유형 */
    userType: UserType;
    /** 파일 이름 */
    fileName: string;
  } & CorrelationParams): FileHistory {
    return FileHistory.create({
      fileId: params.fileId,
      version: params.version,
      changeType: FileChangeType.DELETED,
      changedBy: params.changedBy,
      userType: params.userType,
      changeSummary: `영구 삭제: ${params.fileName}`,
      requestId: params.requestId,
      traceId: params.traceId,
    });
  }

  /**
   * 재구성 (DB에서 로드 시)
   *
   * @param props - DB에서 조회한 데이터 (id 필수)
   * @returns 재구성된 FileHistory 인스턴스
   */
  static reconstitute(props: Partial<FileHistory> & { id: string }): FileHistory {
    return new FileHistory(props);
  }
}
