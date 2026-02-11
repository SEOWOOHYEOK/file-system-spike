/**
 * ============================================================
 * NAS 연결 에러 판별 헬퍼 테스트
 * ============================================================
 *
 * 테스트 대상:
 *   - isNasConnectionError()
 *
 * 비즈니스 맥락:
 *   - NAS I/O 작업 실패 시 네트워크/연결 문제인지 판별
 *   - 연결 에러: NasStatusCache unhealthy 전환 트리거
 *   - 파일 없음 등 앱 레벨 에러: NAS 상태 변경 없음
 *
 * 중요 고려사항:
 *   - Error 인스턴스가 아니면 false
 *   - message와 code 모두 검사
 *   - 대소문자 무관 (lowercase 비교)
 * ============================================================
 */
import { isNasConnectionError } from './nas-error.helper';

describe('isNasConnectionError', () => {
  // ═══════════════════════════════════════════════════════
  // NAS 연결 에러 (true 반환)
  // ═══════════════════════════════════════════════════════
  describe('NAS 연결 에러 감지 (true)', () => {
    it.each([
      ['ENETUNREACH', 'connect ENETUNREACH 192.168.10.249:445'],
      ['ETIMEDOUT', 'connect ETIMEDOUT 192.168.10.249:445'],
      ['ECONNREFUSED', 'connect ECONNREFUSED 192.168.10.249:445'],
      ['ECONNRESET', 'read ECONNRESET'],
      ['EHOSTUNREACH', 'connect EHOSTUNREACH 192.168.10.249'],
      ['EPERM', 'EPERM: operation not permitted, open \'\\\\192.168.10.249\\Web\''],
      ['EACCES', 'EACCES: permission denied, access \'\\\\192.168.10.249\\Web\''],
      ['network name', 'The network name cannot be found'],
      ['network path', 'The network path was not found'],
      ['nas_unavailable', 'NAS_UNAVAILABLE: NAS 스토리지 연결 불가'],
      ['no mapped drive', 'No mapped drive found for UNC path'],
      ['the specified network', 'The specified network resource is no longer available'],
      ['timeout', 'Connection timeout after 10000ms'],
    ])('에러 메시지에 "%s" 패턴이 포함되면 true를 반환해야 한다', (_pattern, message) => {
      const error = new Error(message);
      expect(isNasConnectionError(error)).toBe(true);
    });

    it('에러 코드(code)에 패턴이 있으면 true를 반환해야 한다', () => {
      const error = new Error('some generic error') as NodeJS.ErrnoException;
      error.code = 'ETIMEDOUT';
      expect(isNasConnectionError(error)).toBe(true);
    });

    it('대소문자가 달라도 감지해야 한다', () => {
      const error = new Error('Connect ECONNREFUSED 127.0.0.1:445');
      expect(isNasConnectionError(error)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 앱 레벨 에러 (false 반환)
  // ═══════════════════════════════════════════════════════
  describe('앱 레벨 에러 (false)', () => {
    it('파일 없음 에러는 NAS 연결 에러가 아니다', () => {
      const error = new Error('ENOENT: no such file or directory, open \'/mnt/nas/files/abc.pdf\'');
      // ENOENT는 NAS_CONNECTION_ERROR_PATTERNS에 포함되지 않음
      expect(isNasConnectionError(error)).toBe(false);
    });

    it('일반 비즈니스 에러는 NAS 연결 에러가 아니다', () => {
      const error = new Error('File not found in database');
      expect(isNasConnectionError(error)).toBe(false);
    });

    it('유효성 검증 에러는 NAS 연결 에러가 아니다', () => {
      const error = new Error('Invalid file name: test.exe');
      expect(isNasConnectionError(error)).toBe(false);
    });

    it('DB 에러는 NAS 연결 에러가 아니다', () => {
      const error = new Error('QueryFailedError: duplicate key value');
      expect(isNasConnectionError(error)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 비-Error 타입
  // ═══════════════════════════════════════════════════════
  describe('비-Error 타입', () => {
    it('문자열은 false를 반환해야 한다', () => {
      expect(isNasConnectionError('ETIMEDOUT')).toBe(false);
    });

    it('null은 false를 반환해야 한다', () => {
      expect(isNasConnectionError(null)).toBe(false);
    });

    it('undefined는 false를 반환해야 한다', () => {
      expect(isNasConnectionError(undefined)).toBe(false);
    });

    it('숫자는 false를 반환해야 한다', () => {
      expect(isNasConnectionError(42)).toBe(false);
    });

    it('객체는 false를 반환해야 한다', () => {
      expect(isNasConnectionError({ message: 'ETIMEDOUT' })).toBe(false);
    });
  });
});
