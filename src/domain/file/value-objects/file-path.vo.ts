/**
 * 파일 경로 값 객체 (Value Object)
 * 파일의 전체 경로를 불변 객체로 관리합니다.
 */
export class FilePath {
  private readonly _value: string;

  constructor(path: string) {
    this._value = this.normalize(path);
  }

  /**
   * 경로 정규화
   */
  private normalize(path: string): string {
    // 백슬래시를 슬래시로 변환
    let normalized = path.replace(/\\/g, '/');
    // 중복 슬래시 제거
    normalized = normalized.replace(/\/+/g, '/');
    // 선행 슬래시 보장
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }
    // 후행 슬래시 제거 (루트 제외)
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }

  /**
   * 경로 값 반환
   */
  get value(): string {
    return this._value;
  }

  /**
   * 파일명 추출
   */
  getFileName(): string {
    const parts = this._value.split('/');
    return parts[parts.length - 1] || '';
  }

  /**
   * 확장자 추출
   */
  getExtension(): string {
    const fileName = this.getFileName();
    const lastDot = fileName.lastIndexOf('.');
    return lastDot > 0 ? fileName.substring(lastDot + 1) : '';
  }

  /**
   * 확장자 없는 파일명 추출
   */
  getFileNameWithoutExtension(): string {
    const fileName = this.getFileName();
    const lastDot = fileName.lastIndexOf('.');
    return lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
  }

  /**
   * 상위 디렉토리 경로 추출
   */
  getParentPath(): FilePath | null {
    const lastSlash = this._value.lastIndexOf('/');
    if (lastSlash <= 0) {
      return null;
    }
    return new FilePath(this._value.substring(0, lastSlash));
  }

  /**
   * 하위 경로 추가
   */
  append(subPath: string): FilePath {
    return new FilePath(this._value + '/' + subPath);
  }

  /**
   * 휴지통 경로로 변환
   */
  toTrashPath(trashMetadataId: string): FilePath {
    return new FilePath(`/.trash/${trashMetadataId}${this._value}`);
  }

  /**
   * 휴지통 경로에서 원본 경로 추출
   */
  static fromTrashPath(trashPath: string, trashMetadataId: string): FilePath {
    const prefix = `/.trash/${trashMetadataId}`;
    if (trashPath.startsWith(prefix)) {
      return new FilePath(trashPath.substring(prefix.length));
    }
    return new FilePath(trashPath);
  }

  /**
   * 파일명 변경된 새 경로 반환
   */
  withNewFileName(newFileName: string): FilePath {
    const parentPath = this.getParentPath();
    if (parentPath) {
      return parentPath.append(newFileName);
    }
    return new FilePath('/' + newFileName);
  }

  /**
   * 동일성 비교
   */
  equals(other: FilePath): boolean {
    return this._value === other._value;
  }

  /**
   * 문자열 변환
   */
  toString(): string {
    return this._value;
  }
}
