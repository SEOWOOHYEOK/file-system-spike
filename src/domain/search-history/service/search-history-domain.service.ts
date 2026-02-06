/**
 * 검색 내역 도메인 서비스
 * 검색 내역 저장, 조회, 삭제 도메인 로직을 담당합니다.
 *
 * DDD 규칙: Repository는 Domain Service에서만 주입받습니다.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  SearchHistoryEntity,
  SearchHistoryType,
} from '../entities/search-history.entity';
import { SEARCH_HISTORY_REPOSITORY } from '../repositories/search-history.repository.interface';
import type { ISearchHistoryRepository } from '../repositories/search-history.repository.interface';

/** 사용자당 최대 검색 내역 보관 수 */
const MAX_HISTORY_PER_USER = 100;

@Injectable()
export class SearchHistoryDomainService {
  private readonly logger = new Logger(SearchHistoryDomainService.name);

  constructor(
    @Inject(SEARCH_HISTORY_REPOSITORY)
    private readonly searchHistoryRepository: ISearchHistoryRepository,
  ) {}

  /**
   * 검색 내역 기록
   * - 동일한 키워드+타입 검색이면 기존 내역을 갱신 (검색 시간, 결과 수 업데이트)
   * - 새로운 검색이면 신규 내역 생성
   */
  async 검색내역기록(
    userId: string,
    keyword: string,
    searchType: SearchHistoryType,
    resultCount: number,
    filters?: Record<string, any>,
  ): Promise<SearchHistoryEntity> {
    // 동일 키워드+타입 검색 내역 확인
    const existing = await this.searchHistoryRepository.findByUserIdAndKeyword(
      userId,
      keyword,
      searchType,
    );

    if (existing) {
      // 기존 내역 갱신 (검색 시간 & 결과 수 업데이트)
      existing.searchedAt = new Date();
      existing.resultCount = resultCount;
      existing.filters = filters || null;
      return this.searchHistoryRepository.save(existing);
    }

    // 새 검색 내역 생성
    const entity = new SearchHistoryEntity({
      id: uuidv4(),
      userId,
      keyword,
      searchType,
      filters: filters || null,
      resultCount,
      searchedAt: new Date(),
    });

    const saved = await this.searchHistoryRepository.save(entity);

    this.logger.debug(
      `검색 내역 기록: userId=${userId}, keyword="${keyword}", type=${searchType}`,
    );

    return saved;
  }

  /**
   * 내 검색 내역 조회 (최신순 페이지네이션)
   */
  async 검색내역조회(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: SearchHistoryEntity[]; total: number }> {
    return this.searchHistoryRepository.findByUserId(userId, limit, offset);
  }

  /**
   * 검색 내역 단건 삭제
   */
  async 검색내역삭제(id: string, userId: string): Promise<boolean> {
    return this.searchHistoryRepository.deleteById(id, userId);
  }

  /**
   * 전체 검색 내역 삭제
   */
  async 전체검색내역삭제(userId: string): Promise<number> {
    return this.searchHistoryRepository.deleteAllByUserId(userId);
  }
}
