/**
 * NAS 연결 에러 판별 헬퍼
 *
 * NAS I/O 작업에서 발생한 에러가 네트워크/연결 문제인지 판별합니다.
 * 연결 에러로 판별되면 NasStatusCacheService를 unhealthy로 전환하여
 * 이후 API 요청과 워커 작업을 차단합니다.
 *
 * 파일 없음(ENOENT on specific file) 등 애플리케이션 레벨 에러는
 * NAS 연결 문제가 아니므로 false를 반환합니다.
 */

/**
 * NAS 연결/네트워크 에러 패턴
 * - ENETUNREACH: 네트워크 도달 불가
 * - ETIMEDOUT: 연결 타임아웃
 * - ECONNREFUSED: 연결 거부
 * - ECONNRESET: 연결 리셋
 * - EHOSTUNREACH: 호스트 도달 불가
 * - EPERM: 권한 없음 (NAS 마운트 해제 시)
 * - EACCES: 접근 거부 (NAS 인증 실패)
 * - network name: Windows 네트워크 경로 오류
 * - unc: UNC 경로 관련 에러
 * - nas_unavailable: 내부 NAS 불가 마커
 * - no mapped drive: 매핑 드라이브 미발견
 */
const NAS_CONNECTION_ERROR_PATTERNS = [
  'enetunreach',
  'etimedout',
  'econnrefused',
  'econnreset',
  'ehostunreach',
  'eperm',
  'eacces',
  'network name',
  'network path',
  'nas_unavailable',
  'no mapped drive',
  'the specified network',
  'timeout',
] as const;

/**
 * 에러가 NAS 연결/네트워크 문제인지 판별
 *
 * @param error - 발생한 에러
 * @returns NAS 연결 에러이면 true
 */
export function isNasConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const msg = error.message.toLowerCase();
  const code = (error as NodeJS.ErrnoException).code?.toLowerCase() ?? '';

  return NAS_CONNECTION_ERROR_PATTERNS.some(
    (pattern) => msg.includes(pattern) || code.includes(pattern),
  );
}
