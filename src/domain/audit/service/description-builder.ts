import { AuditAction } from '../enums/audit-action.enum';
import { FileChangeType } from '../enums/file-change.enum';
import { SystemEventType } from '../enums/system-event-type.enum';
import { LogResult, UserType } from '../enums/common.enum';
import { FileState } from '../entities/file-history.entity';

/**
 * 이벤트 설명 생성기
 *
 * 모든 관찰 가능성 이벤트의 사람이 읽을 수 있는 한국어 설명을 생성하는 단일 소스
 * 설명 형식이 변경되어야 할 때는 이 파일만 수정하면 됨
 *
 * 설계 원칙:
 * - 사실 기반 중립적 언어 사용 (판단적 용어 지양)
 * - [행위자] + [동사] + [대상] + [부가정보] 형식
 * - TypeScript의 Record 타입으로 완전성 보장 (컴파일 타임 체크)
 */
export class EventDescriptionBuilder {
  /**
   * 감사 로그 설명 생성
   *
   * @param params - 감사 로그 설명 생성 파라미터
   * @returns 한국어 설명 문자열
   */
  static forAuditLog(params: {
    action: AuditAction;
    actorName: string;
    actorDepartment?: string;
    actorType?: UserType;
    targetName?: string;
    result: LogResult;
    failReason?: string;
    errorCode?: string;
    metadata?: Record<string, unknown>;
  }): string {
    const actor = this.formatActor({
      name: params.actorName,
      department: params.actorDepartment,
      userType: params.actorType,
    });

    const template = auditLogTemplates[params.action];
    if (!template) {
      throw new Error(`No template found for AuditAction: ${params.action}`);
    }

    let description = template({
      actor,
      targetName: params.targetName || '알 수 없는 파일',
      metadata: params.metadata || {},
    });

    // 실패 시 래핑
    if (params.result === LogResult.FAIL) {
      description = this.wrapFailure(
        description,
        params.errorCode,
        params.failReason,
      );
    }

    return description;
  }

  /**
   * 파일 이력 설명 생성
   *
   * @param params - 파일 이력 설명 생성 파라미터
   * @returns 한국어 설명 문자열
   */
  static forFileHistory(params: {
    changeType: FileChangeType;
    actorName: string;
    actorDepartment?: string;
    actorType?: UserType;
    fileName: string;
    previousState?: FileState;
    newState?: FileState;
    version?: number;
  }): string {
    const actor = this.formatActor({
      name: params.actorName,
      department: params.actorDepartment,
      userType: params.actorType,
    });

    const template = fileHistoryTemplates[params.changeType];
    if (!template) {
      throw new Error(`No template found for FileChangeType: ${params.changeType}`);
    }

    return template({
      actor,
      fileName: params.fileName,
      previousState: params.previousState,
      newState: params.newState,
      version: params.version,
    });
  }

  /**
   * 시스템 이벤트 설명 생성
   *
   * @param params - 시스템 이벤트 설명 생성 파라미터
   * @returns 한국어 설명 문자열
   */
  static forSystemEvent(params: {
    component: string;
    eventType: SystemEventType;
    result: string;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
    targetName?: string;
    errorCode?: string;
    retryCount?: number;
    metadata?: Record<string, unknown>;
  }): string {
    const template = systemEventTemplates[params.eventType];
    if (!template) {
      throw new Error(`No template found for SystemEventType: ${params.eventType}`);
    }

    return template({
      component: params.component,
      targetName: params.targetName || '',
      previousState: params.previousState || {},
      newState: params.newState || {},
      errorCode: params.errorCode,
      retryCount: params.retryCount,
      metadata: params.metadata || {},
    });
  }

  /**
   * 행위자 포맷팅
   *
   * @param params - 행위자 정보
   * @returns 포맷된 행위자 문자열
   *
   * 예시:
   * - "김철수(영업팀)" - 내부 사용자 + 부서 있음
   * - "김철수" - 내부 사용자 + 부서 없음
   * - "외부사용자 김철수" - 외부 사용자
   */
  private static formatActor(params: {
    name: string;
    department?: string;
    userType?: UserType;
  }): string {
    const { name, department, userType } = params;

    // 외부 사용자 처리
    if (userType === UserType.EXTERNAL) {
      return `외부사용자 ${name}`;
    }

    // 내부 사용자 + 부서 있음
    if (department) {
      return `${name}(${department})`;
    }

    // 내부 사용자 + 부서 없음
    return name;
  }

  /**
   * 바이트 크기 포맷팅
   *
   * @param bytes - 바이트 크기
   * @returns 포맷된 크기 문자열 (예: "1.2MB", "500KB")
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0B';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }

  /**
   * 실패 설명 래핑
   *
   * @param description - 원본 설명
   * @param errorCode - 오류 코드
   * @param failReason - 실패 사유
   * @returns 래핑된 설명
   */
  private static wrapFailure(
    description: string,
    errorCode?: string,
    failReason?: string,
  ): string {
    const parts: string[] = [description, '실패'];
    if (failReason) {
      parts.push(`: ${failReason}`);
    }
    if (errorCode) {
      parts.push(` (${errorCode})`);
    }
    return parts.join('');
  }
}

// ========== 감사 로그 템플릿 ==========

type AuditLogTemplateParams = {
  actor: string;
  targetName: string;
  metadata: Record<string, unknown>;
};

type AuditLogTemplate = (params: AuditLogTemplateParams) => string;

/**
 * 감사 로그 템플릿 맵
 *
 * Record 타입으로 모든 AuditAction에 대한 템플릿을 강제
 * 새로운 AuditAction이 추가되면 컴파일 에러 발생
 */
const auditLogTemplates: Record<AuditAction, AuditLogTemplate> = {
  [AuditAction.FILE_VIEW]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}'를 조회함`,

  [AuditAction.FILE_DOWNLOAD]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}'를 다운로드함`,

  [AuditAction.FILE_UPLOAD]: ({ actor, targetName, metadata }) => {
    const fileSize = metadata.size as number | undefined;
    const sizeStr = fileSize ? ` (${EventDescriptionBuilder.formatBytes(fileSize)})` : '';
    return `${actor}이 '${targetName}'를 업로드함${sizeStr}`;
  },

  [AuditAction.FILE_RENAME]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}' 이름을 변경함`,

  [AuditAction.FILE_MOVE]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}'를 이동함`,

  [AuditAction.FILE_DELETE]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}'를 삭제함`,

  [AuditAction.FILE_RESTORE]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}'를 복원함`,

  [AuditAction.FILE_PURGE]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}'를 영구 삭제함`,

  [AuditAction.FOLDER_CREATE]: ({ actor, targetName }) =>
    `${actor}이 폴더 '${targetName}'를 생성함`,

  [AuditAction.FOLDER_VIEW]: ({ actor, targetName }) =>
    `${actor}이 폴더 '${targetName}'를 조회함`,

  [AuditAction.FOLDER_RENAME]: ({ actor, targetName }) =>
    `${actor}이 폴더 '${targetName}' 이름을 변경함`,

  [AuditAction.FOLDER_MOVE]: ({ actor, targetName }) =>
    `${actor}이 폴더 '${targetName}'를 이동함`,

  [AuditAction.FOLDER_DELETE]: ({ actor, targetName }) =>
    `${actor}이 폴더 '${targetName}'를 삭제함`,

  [AuditAction.SHARE_CREATE]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}' 공유 링크를 생성함`,

  [AuditAction.SHARE_REVOKE]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}' 공유를 해제함`,

  [AuditAction.SHARE_ACCESS]: ({ actor, targetName }) =>
    `${actor}이 공유 링크로 '${targetName}'에 접근함`,

  [AuditAction.SHARE_DOWNLOAD]: ({ actor, targetName }) =>
    `${actor}이 공유 파일 '${targetName}'를 다운로드함`,

  [AuditAction.SHARE_BLOCK]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}' 공유를 차단함`,

  [AuditAction.SHARE_UNBLOCK]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}' 공유 차단을 해제함`,

  [AuditAction.SHARE_BULK_BLOCK]: ({ actor }) =>
    `${actor}이 공유를 일괄 차단함`,

  [AuditAction.SHARE_BULK_UNBLOCK]: ({ actor }) =>
    `${actor}이 공유 일괄 차단을 해제함`,

  [AuditAction.SHARE_REQUEST_CREATE]: ({ actor }) =>
    `${actor}이 공유 요청을 생성함`,

  [AuditAction.SHARE_REQUEST_APPROVE]: ({ actor }) =>
    `${actor}이 공유 요청을 승인함`,

  [AuditAction.SHARE_REQUEST_REJECT]: ({ actor }) =>
    `${actor}이 공유 요청을 반려함`,

  [AuditAction.SHARE_REQUEST_CANCEL]: ({ actor }) =>
    `${actor}이 공유 요청을 취소함`,

  [AuditAction.SHARE_REQUEST_BULK_APPROVE]: ({ actor }) =>
    `${actor}이 공유 요청을 일괄 승인함`,

  [AuditAction.SHARE_REQUEST_BULK_REJECT]: ({ actor }) =>
    `${actor}이 공유 요청을 일괄 반려함`,

  [AuditAction.PERMISSION_GRANT]: ({ actor }) =>
    `${actor}이 권한을 부여함`,

  [AuditAction.PERMISSION_REVOKE]: ({ actor }) =>
    `${actor}이 권한을 회수함`,

  [AuditAction.PERMISSION_CHANGE]: ({ actor }) =>
    `${actor}이 권한을 변경함`,

  [AuditAction.TRASH_EMPTY]: ({ actor }) =>
    `${actor}이 휴지통을 비움`,

  [AuditAction.TRASH_VIEW]: ({ actor }) =>
    `${actor}이 휴지통을 조회함`,

  [AuditAction.FAVORITE_ADD]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}'를 즐겨찾기에 추가함`,

  [AuditAction.FAVORITE_REMOVE]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}'를 즐겨찾기에서 제거함`,

  [AuditAction.FAVORITE_VIEW]: ({ actor }) =>
    `${actor}이 즐겨찾기를 조회함`,

  [AuditAction.ACTIVITY_VIEW]: ({ actor }) =>
    `${actor}이 활동 내역을 조회함`,

  // === 외부 사용자 관리 ===
  [AuditAction.EXTERNAL_USER_CREATE]: ({ actor, targetName }) =>
    `${actor}이 외부 사용자 '${targetName || ''}'를 생성함`,

  [AuditAction.EXTERNAL_USER_UPDATE]: ({ actor, targetName }) =>
    `${actor}이 외부 사용자 '${targetName || ''}' 정보를 수정함`,

  [AuditAction.EXTERNAL_USER_DEACTIVATE]: ({ actor, targetName }) =>
    `${actor}이 외부 사용자 '${targetName || ''}' 계정을 비활성화함`,

  [AuditAction.EXTERNAL_USER_ACTIVATE]: ({ actor, targetName }) =>
    `${actor}이 외부 사용자 '${targetName || ''}' 계정을 활성화함`,

  [AuditAction.EXTERNAL_USER_PASSWORD_RESET]: ({ actor, targetName }) =>
    `${actor}이 외부 사용자 '${targetName || ''}' 비밀번호를 초기화함`,

  // === 비밀번호 변경 ===
  [AuditAction.PASSWORD_CHANGE]: ({ actor }) =>
    `${actor}이 비밀번호를 변경함`,

  // === 관리자 작업 ===
  [AuditAction.USER_ROLE_ASSIGN]: ({ actor, targetName }) =>
    `${actor}이 사용자 '${targetName || ''}'에게 Role을 부여함`,

  [AuditAction.USER_ROLE_REMOVE]: ({ actor, targetName }) =>
    `${actor}이 사용자 '${targetName || ''}'의 Role을 제거함`,

  [AuditAction.USER_SYNC]: ({ actor }) =>
    `${actor}이 Employee → User 동기화를 실행함`,

  [AuditAction.TOKEN_GENERATE]: ({ actor, metadata }) =>
    `${actor}이 JWT 토큰을 수동 생성함${metadata?.employeeNumber ? ` (${metadata.employeeNumber})` : ''}`,

  [AuditAction.TOKEN_REFRESH]: ({ actor }) =>
    `${actor}이 토큰을 갱신함`,

  [AuditAction.ORG_MIGRATION]: ({ actor }) =>
    `${actor}이 SSO 조직 데이터 마이그레이션을 실행함`,

  // === 파일 작업 요청 ===
  [AuditAction.FILE_ACTION_REQUEST_MOVE_CREATE]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}' 파일 이동 요청을 생성함`,

  [AuditAction.FILE_ACTION_REQUEST_DELETE_CREATE]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}' 파일 삭제 요청을 생성함`,

  [AuditAction.FILE_ACTION_REQUEST_CANCEL]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}' 파일 작업 요청을 취소함`,

  [AuditAction.FILE_ACTION_REQUEST_APPROVE]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}' 파일 작업 요청을 승인함`,

  [AuditAction.FILE_ACTION_REQUEST_REJECT]: ({ actor, targetName }) =>
    `${actor}이 '${targetName}' 파일 작업 요청을 반려함`,

  [AuditAction.FILE_ACTION_REQUEST_BULK_APPROVE]: ({ actor, metadata }) =>
    `${actor}이 파일 작업 요청 ${metadata?.count || ''}건을 일괄 승인함`,

  [AuditAction.FILE_ACTION_REQUEST_BULK_REJECT]: ({ actor, metadata }) =>
    `${actor}이 파일 작업 요청 ${metadata?.count || ''}건을 일괄 반려함`,

  [AuditAction.FILE_ACTION_REQUEST_INVALIDATED]: ({ actor, targetName }) =>
    `'${targetName}' 파일 작업 요청이 상태 변경으로 무효화됨`,

  // === 외부 사용자 공유 접근 ===
  [AuditAction.EXTERNAL_SHARE_DETAIL]: ({ actor, targetName }) =>
    `${actor}이 외부 공유 '${targetName}' 상세 정보를 조회함`,

  [AuditAction.EXTERNAL_SHARE_ACCESS]: ({ actor, targetName }) =>
    `${actor}이 외부 공유 '${targetName}' 파일 콘텐츠에 접근함`,

  [AuditAction.EXTERNAL_SHARE_DOWNLOAD]: ({ actor, targetName }) =>
    `${actor}이 외부 공유 '${targetName}' 파일을 다운로드함`,

  // === 보안 이벤트 (SecurityEvent 흡수) ===
  [AuditAction.LOGIN_SUCCESS]: ({ actor }) =>
    `${actor}이 로그인함`,

  [AuditAction.LOGIN_FAILURE]: ({ metadata }) =>
    `로그인 실패: ${metadata?.email || '알 수 없는 계정'}`,

  [AuditAction.LOGOUT]: ({ actor }) =>
    `${actor}이 로그아웃함`,

  [AuditAction.TOKEN_EXPIRED]: ({ actor }) =>
    `${actor}의 토큰이 만료됨`,

  [AuditAction.PERMISSION_DENIED]: ({ actor, targetName }) =>
    `${actor}의 '${targetName}' 접근이 거부됨`,

  [AuditAction.EXPIRED_LINK_ACCESS]: ({ actor }) =>
    `${actor}이 만료된 공유 링크로 접근 시도함`,

  [AuditAction.BLOCKED_SHARE_ACCESS]: ({ actor }) =>
    `${actor}이 차단된 공유에 접근 시도함`,

  [AuditAction.ACCESS_PATTERN_DEVIATION]: ({ actor }) =>
    `${actor}의 접근 패턴이 기존 분포에서 이탈함`,

  [AuditAction.NEW_DEVICE_ACCESS]: ({ actor }) =>
    `${actor}이 신규 기기에서 접근함`,
};

// ========== 파일 이력 템플릿 ==========

type FileHistoryTemplateParams = {
  actor: string;
  fileName: string;
  previousState?: FileState;
  newState?: FileState;
  version?: number;
};

type FileHistoryTemplate = (params: FileHistoryTemplateParams) => string;

/**
 * 파일 이력 템플릿 맵
 *
 * Record 타입으로 모든 FileChangeType에 대한 템플릿을 강제
 * 새로운 FileChangeType이 추가되면 컴파일 에러 발생
 */
const fileHistoryTemplates: Record<FileChangeType, FileHistoryTemplate> = {
  [FileChangeType.CREATED]: ({ actor, fileName, newState }) => {
    const size = newState?.size;
    const sizeStr = size ? ` (${EventDescriptionBuilder.formatBytes(size)})` : '';
    return `${actor}이 '${fileName}'를 생성함${sizeStr}`;
  },

  [FileChangeType.CONTENT_REPLACED]: ({ actor, fileName, version }) => {
    const versionStr = version ? ` (버전 ${version})` : '';
    return `${actor}이 '${fileName}' 내용을 교체함${versionStr}`;
  },

  [FileChangeType.RENAMED]: ({ actor, fileName, previousState, newState }) => {
    const newName = newState?.name;
    if (newName) {
      return `${actor}이 '${fileName}' 이름을 '${newName}'로 변경함`;
    }
    return `${actor}이 '${fileName}' 이름을 변경함`;
  },

  [FileChangeType.MOVED]: ({ actor, fileName, previousState, newState }) => {
    const previousPath = previousState?.path || '알 수 없는 경로';
    const newPath = newState?.path || '알 수 없는 경로';
    return `${actor}이 '${fileName}'를 ${previousPath}에서 ${newPath}로 이동함`;
  },

  [FileChangeType.METADATA_CHANGED]: ({ actor, fileName }) =>
    `${actor}이 '${fileName}' 메타데이터를 변경함`,

  [FileChangeType.TRASHED]: ({ actor, fileName }) =>
    `${actor}이 '${fileName}'를 휴지통으로 이동함`,

  [FileChangeType.RESTORED]: ({ actor, fileName }) =>
    `${actor}이 '${fileName}'를 복원함`,

  [FileChangeType.DELETED]: ({ actor, fileName }) =>
    `${actor}이 '${fileName}'를 영구 삭제함`,
};

// ========== 시스템 이벤트 템플릿 ==========

type SystemEventTemplateParams = {
  component: string;
  targetName: string;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown>;
  errorCode?: string;
  retryCount?: number;
  metadata: Record<string, unknown>;
};

type SystemEventTemplate = (params: SystemEventTemplateParams) => string;

/**
 * 시스템 이벤트 템플릿 맵
 *
 * Record 타입으로 모든 SystemEventType에 대한 템플릿을 강제
 * 새로운 SystemEventType이 추가되면 컴파일 에러 발생
 */
const systemEventTemplates: Record<SystemEventType, SystemEventTemplate> = {
  [SystemEventType.NAS_STATUS_CHANGED]: ({ component, previousState, newState }) => {
    const previousStatus = previousState.status as string | undefined || '알 수 없음';
    const newStatus = newState.status as string | undefined || '알 수 없음';
    return `[${component}] NAS 상태 변경: ${previousStatus} → ${newStatus}`;
  },

  [SystemEventType.NAS_SYNC_STARTED]: ({ component, targetName }) =>
    `[${component}] '${targetName}' NAS 싱크 시작`,

  [SystemEventType.NAS_SYNC_COMPLETED]: ({ component, targetName, metadata }) => {
    const durationMs = metadata.durationMs as number | undefined;
    const durationStr = durationMs ? ` (${durationMs}ms)` : '';
    return `[${component}] '${targetName}' NAS 싱크 완료${durationStr}`;
  },

  [SystemEventType.NAS_SYNC_DEFERRED]: ({ component, targetName, retryCount }) => {
    const retryStr = retryCount ? ` (${retryCount}회차)` : '';
    return `[${component}] '${targetName}' NAS 싱크 지연${retryStr}`;
  },

  [SystemEventType.NAS_SYNC_RECOVERED]: ({ component, targetName }) =>
    `[${component}] '${targetName}' NAS 싱크 복구 완료`,

  [SystemEventType.NAS_SYNC_FAILED]: ({ component, targetName, errorCode }) => {
    const errorStr = errorCode ? ` (${errorCode})` : '';
    return `[${component}] '${targetName}' NAS 싱크 실패${errorStr}`;
  },

  [SystemEventType.NAS_STORAGE_WARNING]: ({ component, metadata }) => {
    const usagePercent = metadata.usagePercent as number | undefined;
    const usageStr = usagePercent ? `: 사용률 ${usagePercent}%` : '';
    return `[${component}] NAS 용량 경고${usageStr}`;
  },

  [SystemEventType.NAS_UPLOAD_REJECTED]: ({ component }) =>
    `[${component}] 업로드 거부됨`,

  [SystemEventType.NAS_HEALTH_CHECK]: ({ component }) =>
    `[${component}] NAS 헬스체크 수행`,

  [SystemEventType.SCHEDULER_RUN]: ({ component }) =>
    `[${component}] 스케줄러 실행`,

  [SystemEventType.SCHEDULER_ERROR]: ({ component, errorCode }) => {
    const errorStr = errorCode ? ` (${errorCode})` : '';
    return `[${component}] 스케줄러 오류 발생${errorStr}`;
  },

  [SystemEventType.WORKER_TASK_STARTED]: ({ component }) =>
    `[${component}] 워커 작업 시작`,

  [SystemEventType.WORKER_TASK_COMPLETED]: ({ component }) =>
    `[${component}] 워커 작업 완료`,

  [SystemEventType.WORKER_TASK_FAILED]: ({ component, errorCode }) => {
    const errorStr = errorCode ? ` (${errorCode})` : '';
    return `[${component}] 워커 작업 실패${errorStr}`;
  },
};
