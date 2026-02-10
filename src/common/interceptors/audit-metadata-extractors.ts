/**
 * 감사 로그 메타데이터 추출기
 *
 * 각 컨트롤러 액션별로 request/response에서
 * 최대한 풍부한 감사 정보를 추출하는 순수 함수 모음
 *
 * 설계 원칙:
 * - 순수 함수: request, response만 받아 Record<string, unknown> 반환
 * - 방어적 코딩: null/undefined 입력에도 안전
 * - 최대 정보: 요청과 응답 양쪽에서 모두 추출
 */

import type { Request } from 'express';
import type {
  UploadFileResponse,
  MoveFileResponse,
  RenameFileResponse,
  DeleteFileResponse,
} from '../../domain/file';

// ──────────────────────────────────────────────
//  FILE_UPLOAD (단일)
// ──────────────────────────────────────────────

/**
 * 파일 업로드 메타데이터 추출
 *
 * 추출 항목:
 * - request: 원본 파일명, Multer 파일 크기/타입, 대상 폴더, 충돌 전략
 * - response: 저장된 파일 크기/타입/경로, syncEventId
 */
export function extractUploadMetadata(
  request: Request,
  response: UploadFileResponse | null,
): Record<string, unknown> {
  const multerFile = (request as any).file as Express.Multer.File | undefined;
  const fileSize = response?.size ?? multerFile?.size;

  return {
    originalName: multerFile?.originalname,
    fileSize,
    size: fileSize, // description-builder 호환 (metadata.size로 읽음)
    mimeType: response?.mimeType ?? multerFile?.mimetype,
    folderId: request.body?.folderId,
    path: response?.path,
    createdBy: response?.createdBy,
    checksum: response?.checksum,
    conflictStrategy: request.body?.conflictStrategy,
    syncEventId: response?.syncEventId,
  };
}

// ──────────────────────────────────────────────
//  FILE_UPLOAD (다중)
// ──────────────────────────────────────────────

/**
 * 다중 파일 업로드 메타데이터 추출
 *
 * 추출 항목:
 * - request: 대상 폴더, 충돌 전략
 * - response: 파일 수, 총 크기, 각 파일 요약(id, name, size, mimeType)
 */
export function extractUploadManyMetadata(
  request: Request,
  response: UploadFileResponse[] | null,
): Record<string, unknown> {
  const files = Array.isArray(response) ? response : [];
  const totalSize = files.reduce((sum, f) => sum + (f.size ?? 0), 0);

  return {
    fileCount: files.length,
    totalSize,
    size: totalSize, // description-builder 호환 (metadata.size로 읽음)
    targetName: buildMultiFileTargetName(files),
    folderId: request.body?.folderId,
    createdBy: files[0]?.createdBy,
    conflictStrategy: request.body?.conflictStrategy,
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
      checksum: f.checksum,
      createdBy: f.createdBy,
      syncEventId: f.syncEventId,
    })),
  };
}

/**
 * 다중 파일 업로드 시 targetName 생성
 *
 * - 0건: undefined
 * - 1건: "파일명.txt"
 * - N건: "첫번째파일.txt 외 (N-1)건"
 */
function buildMultiFileTargetName(
  files: UploadFileResponse[],
): string | undefined {
  if (files.length === 0) return undefined;
  if (files.length === 1) return files[0].name;
  return `${files[0].name} 외 ${files.length - 1}건`;
}

// ──────────────────────────────────────────────
//  FILE_DOWNLOAD / PREVIEW
// ──────────────────────────────────────────────

/**
 * 파일 다운로드/미리보기 메타데이터 추출
 *
 * 주의: @Res() 사용 시 responseData는 undefined
 * 컨트롤러에서 req.__auditFileInfo에 파일 메타데이터를 저장하므로 여기서 읽는다.
 *
 * 추출 항목:
 * - request: fileId, Range 헤더 (부분 다운로드 여부)
 * - request.__auditFileInfo: 파일명, 경로 (컨트롤러에서 prepareDownload 결과로 설정)
 */
export function extractDownloadMetadata(
  request: Request,
  _response: unknown,
): Record<string, unknown> {
  const rangeHeader = request.headers?.range;
  const auditFileInfo = (request as any).__auditFileInfo as
    | { name: string; path: string }
    | undefined;

  return {
    fileId: request.params?.fileId,
    rangeRequest: rangeHeader || undefined,
    isPartialDownload: !!rangeHeader,
    targetName: auditFileInfo?.name,
    path: auditFileInfo?.path,
  };
}

// ──────────────────────────────────────────────
//  FILE_RENAME
// ──────────────────────────────────────────────

/**
 * 파일명 변경 메타데이터 추출
 *
 * 추출 항목:
 * - request: 새 파일명, 충돌 전략
 * - response: 변경 후 경로, syncEventId
 */
export function extractRenameMetadata(
  request: Request,
  response: RenameFileResponse | null,
): Record<string, unknown> {
  return {
    newName: request.body?.newName,
    conflictStrategy: request.body?.conflictStrategy,
    newPath: response?.path,
    size: response?.size,
    mimeType: response?.mimeType,
    createdBy: response?.createdBy,
    syncEventId: response?.syncEventId,
  };
}

// ──────────────────────────────────────────────
//  FILE_MOVE
// ──────────────────────────────────────────────

/**
 * 파일 이동 메타데이터 추출
 *
 * 추출 항목:
 * - request: 대상 폴더 ID, 충돌 전략
 * - response: 이동 후 경로/폴더, 스킵 여부/사유, syncEventId
 */
export function extractMoveMetadata(
  request: Request,
  response: MoveFileResponse | null,
): Record<string, unknown> {
  return {
    targetFolderId: request.body?.targetFolderId,
    conflictStrategy: request.body?.conflictStrategy,
    newPath: response?.path,
    newFolderId: response?.folderId,
    size: response?.size,
    mimeType: response?.mimeType,
    createdBy: response?.createdBy,
    skipped: response?.skipped,
    skipReason: response?.reason,
    syncEventId: response?.syncEventId,
  };
}

// ──────────────────────────────────────────────
//  FILE_DELETE
// ──────────────────────────────────────────────

/**
 * 파일 삭제(휴지통 이동) 메타데이터 추출
 *
 * 추출 항목:
 * - response: 삭제된 파일명, 상태, 삭제 시각, syncEventId
 */
export function extractDeleteMetadata(
  _request: Request,
  response: DeleteFileResponse | null,
): Record<string, unknown> {
  return {
    fileName: response?.name,
    size: response?.size,
    mimeType: response?.mimeType,
    createdBy: response?.createdBy,
    path: response?.path,
    newState: response?.state,
    trashedAt: response?.trashedAt,
    syncEventId: response?.syncEventId,
  };
}
