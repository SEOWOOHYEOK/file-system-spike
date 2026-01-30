/**
 * 파일 변경 유형
 *
 * 파일 이력(FileHistory)에서 변경 유형을 분류
 */
export enum FileChangeType {
  CREATED = 'CREATED', // 파일 생성
  CONTENT_REPLACED = 'CONTENT_REPLACED', // 내용 교체 (새 버전 업로드)
  RENAMED = 'RENAMED', // 이름 변경
  MOVED = 'MOVED', // 위치 이동
  METADATA_CHANGED = 'METADATA_CHANGED', // 메타데이터 변경
  TRASHED = 'TRASHED', // 휴지통 이동
  RESTORED = 'RESTORED', // 복원됨
  DELETED = 'DELETED', // 영구 삭제
}

/**
 * 파일 변경 유형 한국어 설명
 */
export const FileChangeDescription: Record<FileChangeType, string> = {
  [FileChangeType.CREATED]: '파일 생성',
  [FileChangeType.CONTENT_REPLACED]: '내용 교체',
  [FileChangeType.RENAMED]: '이름 변경',
  [FileChangeType.MOVED]: '위치 이동',
  [FileChangeType.METADATA_CHANGED]: '메타데이터 변경',
  [FileChangeType.TRASHED]: '휴지통 이동',
  [FileChangeType.RESTORED]: '복원됨',
  [FileChangeType.DELETED]: '영구 삭제',
};
