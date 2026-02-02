/**
 * 경로 관련 유틸리티 함수들
 *
 * 파일/폴더 경로 계산 시 루트 폴더 처리 등의 일관된 동작을 보장합니다.
 */

/**
 * 부모 경로와 이름을 결합하여 전체 경로를 생성합니다.
 *
 * 루트 폴더(path === '/')로 이동할 때 이중 슬래시(//)가 발생하는 것을 방지합니다.
 *
 * @param parentPath - 부모 폴더의 경로 (예: '/', '/folder1', '/folder1/folder2')
 * @param name - 결합할 파일 또는 폴더 이름
 * @returns 결합된 전체 경로
 *
 * @example
 * // 루트 폴더에 추가
 * buildPath('/', 'myFolder');  // '/myFolder'
 *
 * // 일반 폴더에 추가
 * buildPath('/parent', 'child');  // '/parent/child'
 *
 * // 중첩 폴더에 추가
 * buildPath('/a/b/c', 'd');  // '/a/b/c/d'
 */
export function buildPath(parentPath: string, name: string): string {
  if (!parentPath || parentPath === '/') {
    return `/${name}`;
  }
  return `${parentPath}/${name}`;
}

/**
 * 경로에서 파일/폴더 이름을 추출합니다.
 *
 * @param path - 전체 경로
 * @returns 마지막 세그먼트 (파일/폴더 이름)
 *
 * @example
 * extractName('/folder1/folder2/file.txt');  // 'file.txt'
 * extractName('/singleFolder');  // 'singleFolder'
 * extractName('/');  // ''
 */
export function extractName(path: string): string {
  if (!path || path === '/') {
    return '';
  }
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
}

/**
 * 경로에서 부모 경로를 추출합니다.
 *
 * @param path - 전체 경로
 * @returns 부모 폴더 경로 (루트 폴더의 경우 null)
 *
 * @example
 * extractParentPath('/folder1/folder2/file.txt');  // '/folder1/folder2'
 * extractParentPath('/singleFolder');  // '/'
 * extractParentPath('/');  // null
 */
export function extractParentPath(path: string): string | null {
  if (!path || path === '/') {
    return null;
  }
  const lastSlashIndex = path.lastIndexOf('/');
  if (lastSlashIndex <= 0) {
    return '/';
  }
  return path.substring(0, lastSlashIndex);
}

/**
 * 경로가 유효한 형식인지 검증합니다.
 *
 * @param path - 검증할 경로
 * @returns 유효한 경로 여부
 *
 * @example
 * isValidPath('/folder/file.txt');  // true
 * isValidPath('//double/slash');  // false (이중 슬래시)
 * isValidPath('no/leading/slash');  // false (시작 슬래시 없음)
 */
export function isValidPath(path: string): boolean {
  if (!path) {
    return false;
  }
  // 루트 경로는 유효
  if (path === '/') {
    return true;
  }
  // 슬래시로 시작해야 함
  if (!path.startsWith('/')) {
    return false;
  }
  // 이중 슬래시 검사
  if (path.includes('//')) {
    return false;
  }
  // 슬래시로 끝나면 안됨 (루트 제외)
  if (path.endsWith('/')) {
    return false;
  }
  return true;
}
