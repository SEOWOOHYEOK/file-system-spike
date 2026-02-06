/**
 * 검색 내역 리포지토리 인터페이스 (포트)
 * Domain Layer에서 정의하며, Infrastructure Layer에서 구현합니다.
 */
import { SearchHistoryEntity } from '../entities/search-history.entity';

/**
 * 리포지토리 토큰
 */
export const SEARCH_HISTORY_REPOSITORY = Symbol('SEARCH_HISTORY_REPOSITORY');

/**
 * 검색 내역 리포지토리 인터페이스
 */
export interface ISearchHistoryRepository {
  /**
   * 검색 내역 저장
   */
  save(entity: SearchHistoryEntity): Promise<SearchHistoryEntity>;

  /**
   * 사용자별 검색 내역 조회 (최신순)
   */
  findByUserId(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: SearchHistoryEntity[]; total: number }>;

  /**
   * 사용자의 동일 키워드 검색 내역 조회 (중복 갱신용)
   */
  findByUserIdAndKeyword(
    userId: string,
    keyword: string,
    searchType: string,
  ): Promise<SearchHistoryEntity | null>;

  /**
   * 검색 내역 단건 삭제
   */
  deleteById(id: string, userId: string): Promise<boolean>;

  /**
   * 사용자의 전체 검색 내역 삭제
   */
  deleteAllByUserId(userId: string): Promise<number>;
}
