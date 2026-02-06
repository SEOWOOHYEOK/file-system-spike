/**
 * 검색 내역 도메인 엔티티
 * 사용자의 검색 기록을 관리합니다.
 *
 * DDD 관점: SearchHistory는 사용자별 검색 기록의 Aggregate Root입니다.
 */

/**
 * 검색 대상 타입
 */
export enum SearchHistoryType {
  ALL = 'all',
  FILE = 'file',
  FOLDER = 'folder',
}

/**
 * 검색 내역 엔티티
 */
export class SearchHistoryEntity {
  /** 검색 내역 ID (UUID) */
  id: string;

  /** 검색한 사용자 ID */
  userId: string;

  /** 검색 키워드 */
  keyword: string;

  /** 검색 대상 타입 (전체/파일/폴더) */
  searchType: SearchHistoryType;

  /** 검색 필터 (JSON) - mimeType, createdBy, 날짜범위 등 */
  filters: Record<string, any> | null;

  /** 검색 결과 수 */
  resultCount: number;

  /** 검색 일시 */
  searchedAt: Date;

  constructor(partial: Partial<SearchHistoryEntity>) {
    Object.assign(this, partial);
  }

  /**
   * 동일한 검색인지 확인 (같은 사용자, 같은 키워드, 같은 타입)
   */
  isSameSearch(userId: string, keyword: string, searchType: SearchHistoryType): boolean {
    return (
      this.userId === userId &&
      this.keyword === keyword &&
      this.searchType === searchType
    );
  }
}
