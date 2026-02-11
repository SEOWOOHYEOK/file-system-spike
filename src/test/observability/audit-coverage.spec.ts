import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { AUDIT_ACTION_KEY } from '../../common/decorators/audit-action.decorator';

// NestJS metadata keys (from @nestjs/common/constants)
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';

// Import all controllers
import { AppController } from '../../app.controller';
import { AdminController } from '../../interface/controller/admin/admin.controller';
import { ObservabilityController } from '../../interface/controller/admin/observability/observability.controller';
import { AuditLogController } from '../../interface/controller/admin/audit-log.controller';
import { RoleController } from '../../interface/controller/admin/role/role.controller';
import { ShareAdminController } from '../../interface/controller/admin/share/share-admin.controller';
import { ShareRequestAdminController } from '../../interface/controller/admin/share-request/share-request-admin.controller';
import { TimelineAdminController } from '../../interface/controller/admin/timeline/timeline-admin.controller';
import { UserAdminController } from '../../interface/controller/admin/user/user-admin.controller';
import { AuthController } from '../../interface/controller/auth/auth.controller';
import { ExternalShareController } from '../../interface/controller/external-auth/external-share.controller';
import { FileController } from '../../interface/controller/file/file.controller';
import { MultipartController } from '../../interface/controller/file/multipart.controller';
import { FolderController } from '../../interface/controller/folder/folder.controller';
import { ShareRequestCreateController } from '../../interface/controller/share/share-request-create.controller';
import { MySentShareController } from '../../interface/controller/share/my-sent-share.controller';
import { MyReceivedRequestController } from '../../interface/controller/share/my-received-request.controller';
import { SyncEventController } from '../../interface/controller/sync-event/sync-event.controller';
import { TrashController } from '../../interface/controller/trash/trash.controller';
import { UserAuditLogController } from '../../interface/controller/user/audit.controller';
import { UserFavoriteController } from '../../interface/controller/user/userFavorite.controller';

/**
 * 감사 로그 커버리지 테스트
 *
 * 모든 컨트롤러 엔드포인트에 @AuditAction 데코레이터가 있는지 확인합니다.
 * CI에서 실행되어 감사 로깅이 누락된 엔드포인트를 감지합니다.
 */

/**
 * 감사 로그에서 제외할 엔드포인트 목록
 *
 * 각 항목은 "ControllerClassName.methodName" 형식입니다.
 * 제외 사유를 주석으로 명시해야 합니다.
 */
const AUDIT_EXEMPT_ENDPOINTS = [
  // 헬스체크 엔드포인트는 감사 로그 불필요
  'AdminController.checkCacheHealth', // GET /v1/admin/cache/health-check
  'AdminController.checkNasHealth', // GET /v1/admin/nas/health-check
  'ObservabilityController.getCurrent', // GET /v1/admin/observability/current (실시간 헬스체크)
  
  // 동기화 진행률 조회는 읽기 전용 모니터링 엔드포인트
  'FileController.getSyncProgress', // GET /v1/files/sync-events/:syncEventId/progress
  
  // TODO: 필요시 추가 제외 엔드포인트를 여기에 추가하되, 반드시 사유를 주석으로 명시할 것
] as const;

type ExemptEndpoint = typeof AUDIT_EXEMPT_ENDPOINTS[number];

/**
 * 컨트롤러 클래스와 이름을 매핑
 */
const CONTROLLERS = [
  { name: 'AppController', controller: AppController },
  { name: 'AdminController', controller: AdminController },
  { name: 'ObservabilityController', controller: ObservabilityController },
  { name: 'AuditLogController', controller: AuditLogController },
  { name: 'RoleController', controller: RoleController },
  { name: 'ShareAdminController', controller: ShareAdminController },
  { name: 'ShareRequestAdminController', controller: ShareRequestAdminController },
  { name: 'TimelineAdminController', controller: TimelineAdminController },
  { name: 'UserAdminController', controller: UserAdminController },
  { name: 'AuthController', controller: AuthController },
  { name: 'ExternalShareController', controller: ExternalShareController },
  { name: 'FileController', controller: FileController },
  { name: 'MultipartController', controller: MultipartController },
  { name: 'FolderController', controller: FolderController },
  { name: 'ShareRequestCreateController', controller: ShareRequestCreateController },
  { name: 'MySentShareController', controller: MySentShareController },
  { name: 'MyReceivedRequestController', controller: MyReceivedRequestController },
  { name: 'SyncEventController', controller: SyncEventController },
  { name: 'TrashController', controller: TrashController },
  { name: 'UserAuditLogController', controller: UserAuditLogController },
  { name: 'UserFavoriteController', controller: UserFavoriteController },
] as const;

/**
 * HTTP 메서드 이름 매핑
 */
const HTTP_METHOD_NAMES: Record<RequestMethod, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
};

/**
 * 엔드포인트 정보
 */
interface EndpointInfo {
  controllerName: string;
  methodName: string;
  httpMethod: string;
  path: string;
  fullPath: string;
}

/**
 * 컨트롤러에서 모든 HTTP 엔드포인트를 찾습니다.
 */
function findEndpoints(controllerName: string, ControllerClass: any): EndpointInfo[] {
  const endpoints: EndpointInfo[] = [];
  
  // 컨트롤러 클래스가 유효한지 확인
  if (!ControllerClass || typeof ControllerClass !== 'function') {
    console.warn(`Skipping ${controllerName}: not a valid controller class`);
    return endpoints;
  }
  
  // 컨트롤러 경로 메타데이터 가져오기 (클래스 자체에 저장됨)
  let controllerPath = '';
  try {
    controllerPath = Reflect.getMetadata(PATH_METADATA, ControllerClass) || '';
  } catch (e) {
    // 메타데이터가 없을 수 있음
    controllerPath = '';
  }
  
  // 프로토타입의 모든 메서드 순회
  if (!ControllerClass.prototype) {
    console.warn(`Skipping ${controllerName}: no prototype found`);
    return endpoints;
  }
  
  const prototype = ControllerClass.prototype;
  const methodNames = Object.getOwnPropertyNames(prototype).filter(
    (name) => name !== 'constructor' && typeof prototype[name] === 'function',
  );

  for (const methodName of methodNames) {
    const method = prototype[methodName];
    
    // HTTP 메서드 메타데이터 확인
    let httpMethod: RequestMethod | undefined;
    try {
      httpMethod = Reflect.getMetadata(METHOD_METADATA, method);
    } catch (e) {
      // 메타데이터가 없을 수 있음
      continue;
    }
    
    if (httpMethod === undefined) {
      continue; // HTTP 엔드포인트가 아님
    }

    // 경로 메타데이터 확인
    let path = '';
    try {
      path = Reflect.getMetadata(PATH_METADATA, method) || '';
    } catch (e) {
      path = '';
    }
    
    // 전체 경로 구성
    let fullPath = controllerPath || '';
    if (path) {
      fullPath = fullPath ? `${fullPath}/${path}`.replace(/\/+/g, '/') : path;
    }
    if (!fullPath.startsWith('/')) {
      fullPath = '/' + fullPath;
    }
    
    endpoints.push({
      controllerName,
      methodName,
      httpMethod: HTTP_METHOD_NAMES[httpMethod] || 'UNKNOWN',
      path,
      fullPath,
    });
  }

  return endpoints;
}

/**
 * 엔드포인트에 @AuditAction 데코레이터가 있는지 확인합니다.
 */
function hasAuditAction(ControllerClass: any, methodName: string): boolean {
  const method = ControllerClass.prototype[methodName];
  if (!method) {
    return false;
  }
  
  const auditMetadata = Reflect.getMetadata(AUDIT_ACTION_KEY, method);
  return auditMetadata !== undefined;
}

/**
 * 엔드포인트가 제외 목록에 있는지 확인합니다.
 */
function isExempt(controllerName: string, methodName: string): boolean {
  const endpointKey = `${controllerName}.${methodName}` as ExemptEndpoint;
  return AUDIT_EXEMPT_ENDPOINTS.includes(endpointKey);
}

describe('Observability Coverage', () => {
  it('모든 컨트롤러 엔드포인트에 @AuditAction이 있어야 한다', () => {
    const missingAudit: Array<{
      endpoint: EndpointInfo;
      exempt: boolean;
    }> = [];

    // 모든 컨트롤러를 순회하며 엔드포인트 확인
    for (const { name: controllerName, controller: ControllerClass } of CONTROLLERS) {
      if (!ControllerClass) {
        console.warn(`Skipping ${controllerName}: controller not imported`);
        continue;
      }
      
      const endpoints = findEndpoints(controllerName, ControllerClass);

      for (const endpoint of endpoints) {
        const exempt = isExempt(controllerName, endpoint.methodName);
        
        if (!exempt && !hasAuditAction(ControllerClass, endpoint.methodName)) {
          missingAudit.push({
            endpoint,
            exempt: false,
          });
        }
      }
    }

    // 실패 메시지 생성
    if (missingAudit.length > 0) {
      const errorMessages = missingAudit.map(({ endpoint }) => {
        return `  - ${endpoint.controllerName}.${endpoint.methodName} (${endpoint.httpMethod} ${endpoint.fullPath})`;
      });

      const errorMessage = [
        'Expected all endpoints to have @AuditAction, but these are missing:',
        ...errorMessages,
        '',
        'To fix:',
        '  1. Add @AuditAction decorator to the missing endpoints',
        '  2. Or add them to AUDIT_EXEMPT_ENDPOINTS with a justification comment',
        '',
        `Total missing: ${missingAudit.length} endpoint(s)`,
      ].join('\n');

      throw new Error(errorMessage);
    }

    // 모든 엔드포인트에 @AuditAction이 있거나 제외 목록에 있음
    expect(missingAudit.length).toBe(0);
  });
});
