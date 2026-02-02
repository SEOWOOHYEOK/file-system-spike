/**
 * 파일명 유틸리티
 * Multer의 Latin-1 인코딩 문제 해결
 */

/**
 * Multer에서 받은 파일명을 정규화
 * 
 * Multer는 multipart/form-data의 filename을 Latin-1(ISO-8859-1)로 해석합니다.
 * 한글 파일명이 UTF-8로 전송되면 깨지게 됩니다.
 * 
 * 이 함수는 Latin-1로 잘못 해석된 UTF-8 문자열을 복구합니다.
 * 
 * @param fileName - Multer에서 받은 originalname
 * @returns 정규화된 UTF-8 파일명
 */
export function normalizeFileName(fileName: string): string {
  if (!fileName) {
    return fileName;
  }

  try {
    // Latin-1로 해석된 바이트를 UTF-8로 다시 디코딩
    const latin1Buffer = Buffer.from(fileName, 'latin1');
    const utf8String = latin1Buffer.toString('utf8');
    
    // UTF-8로 디코딩 성공 여부 확인
    // 유효한 UTF-8이면 변환된 문자열 반환
    if (isValidUtf8(utf8String)) {
      return utf8String;
    }
  } catch {
    // 변환 실패 시 원본 반환
  }

  // 이미 올바른 UTF-8이거나 변환 실패 시 원본 반환
  return fileName;
}

/**
 * 문자열이 유효한 UTF-8인지 확인
 * 깨진 문자(replacement character)가 없는지 확인
 */
function isValidUtf8(str: string): boolean {
  // UTF-8 디코딩 실패 시 나타나는 replacement character 확인
  // U+FFFD (�) 또는 제어 문자가 있으면 잘못된 인코딩
  return !str.includes('\uFFFD') && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(str);
}
