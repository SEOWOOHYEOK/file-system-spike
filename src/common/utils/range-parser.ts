/**
 * HTTP Range 헤더 파싱 유틸리티
 * RFC 7233 Range Requests 지원
 */

/**
 * Range 정보 인터페이스
 */
export interface RangeInfo {
  /** 시작 바이트 위치 (inclusive) */
  start: number;
  /** 끝 바이트 위치 (inclusive) */
  end: number;
}

/**
 * HTTP Range 헤더 파싱
 *
 * 지원 형식:
 * - bytes=0-1048575 (시작-끝)
 * - bytes=1000- (시작부터 끝까지)
 * - bytes=-500 (마지막 500바이트)
 *
 * @param rangeHeader - Range 헤더 값 (예: "bytes=0-1048575")
 * @param fileSize - 전체 파일 크기 (bytes)
 * @returns RangeInfo 또는 null (유효하지 않은 범위)
 */
export function parseRangeHeader(
  rangeHeader: string | undefined,
  fileSize: number,
): RangeInfo | null {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return null;
  }

  // "bytes=" 제거
  const rangeSpec = rangeHeader.slice(6);

  // 다중 Range는 지원하지 않음 (예: bytes=0-100,200-300)
  if (rangeSpec.includes(',')) {
    return null;
  }

  const [startStr, endStr] = rangeSpec.split('-');

  let start: number;
  let end: number;

  if (startStr === '' && endStr !== '') {
    // bytes=-500 형식 (마지막 N 바이트)
    const suffixLength = parseInt(endStr, 10);
    if (isNaN(suffixLength) || suffixLength <= 0) {
      return null;
    }
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else if (startStr !== '' && endStr === '') {
    // bytes=1000- 형식 (시작부터 끝까지)
    start = parseInt(startStr, 10);
    if (isNaN(start) || start < 0) {
      return null;
    }
    end = fileSize - 1;
  } else if (startStr !== '' && endStr !== '') {
    // bytes=0-1048575 형식 (시작-끝)
    start = parseInt(startStr, 10);
    end = parseInt(endStr, 10);
    if (isNaN(start) || isNaN(end) || start < 0 || end < 0) {
      return null;
    }
  } else {
    // bytes=- 형식 (유효하지 않음)
    return null;
  }

  // 범위 검증
  if (start > end) {
    return null;
  }

  // 파일 크기를 초과하는 경우 조정
  if (start >= fileSize) {
    return null; // Range Not Satisfiable
  }

  // end가 파일 크기를 초과하면 파일 끝으로 조정
  if (end >= fileSize) {
    end = fileSize - 1;
  }

  return { start, end };
}

/**
 * Range 요청인지 확인
 */
export function isRangeRequest(rangeHeader: string | undefined): boolean {
  return !!rangeHeader && rangeHeader.startsWith('bytes=');
}

/**
 * Content-Range 헤더 값 생성
 *
 * @param start - 시작 바이트
 * @param end - 끝 바이트
 * @param total - 전체 파일 크기
 * @returns Content-Range 헤더 값 (예: "bytes 0-1048575/10737418240")
 */
export function formatContentRange(start: number, end: number, total: number): string {
  return `bytes ${start}-${end}/${total}`;
}
