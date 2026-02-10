/**
 * 검색 비즈니스 서비스
 * 파일/폴더 통합 검색 기능 및 검색 내역 관리 제공
 * 
 * DDD 규칙: Business Layer는 Repository를 직접 주입받지 않고
 * Domain Service를 통해 도메인 로직을 실행합니다.
 */
import { Injectable, Logger } from '@nestjs/common';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import {
  SearchQuery,
  SearchResponse,
  SearchResultItem,
  SearchResultType,
  SearchFolderItem,
  SearchFileItem,
  SortBy,
  SortOrder,
  FolderDomainService,
} from '../../domain/folder';
import { createPaginationInfo } from '../../common/types/pagination';
import { FileDomainService } from '../../domain/file/service/file-domain.service';
import type { FileSearchFilterOptions } from '../../domain/file/repositories/file.repository.interface';
import {
  SearchHistoryDomainService,
  SearchHistoryType,
  SearchHistoryItem,
  SearchHistoryResponse,
} from '../../domain/search-history';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly folderDomainService: FolderDomainService,
    private readonly fileDomainService: FileDomainService,
    private readonly searchHistoryDomainService: SearchHistoryDomainService,
  ) {}

  /**
   * 파일/폴더 통합 검색
   */
  async search(query: SearchQuery, userId?: string): Promise<SearchResponse> {
    const {
      keyword,
      type,
      mimeType,
      createdBy,
      createdAtFrom,
      createdAtTo,
      sortBy = SortBy.UPDATED_AT,
      sortOrder = SortOrder.DESC,
      page = 1,
      pageSize = 50,
    } = query;

    const offset = (page - 1) * pageSize;

    // 파일 검색용 필터 옵션 구성
    const fileFilterOptions: FileSearchFilterOptions = {
      mimeType,
      createdByName: createdBy,
      createdAtFrom,
      createdAtTo,
    };

    // 필터 옵션이 있는지 확인
    const hasFileFilters = mimeType || createdBy || createdAtFrom || createdAtTo;

    // 검색 타입에 따른 분기 처리
    let response: SearchResponse;

    if (type === SearchResultType.FOLDER) {
      // 폴더 검색 시 파일 전용 필터는 무시
      response = await this.searchFoldersOnly(keyword, sortBy, sortOrder, page, pageSize, offset);
    } else if (type === SearchResultType.FILE) {
      response = await this.searchFilesOnly(keyword, sortBy, sortOrder, page, pageSize, offset, fileFilterOptions);
    } else {
      // 전체 검색 (폴더 + 파일)
      response = await this.searchAll(keyword, sortBy, sortOrder, page, pageSize, offset, hasFileFilters ? fileFilterOptions : undefined);
    }

    // 검색 내역 비동기 기록 (실패해도 검색 결과에 영향 없음)
    if (userId) {
      this.recordSearchHistory(userId, query, response).catch((error) => {
        this.logger.warn(`검색 내역 기록 실패: ${error.message}`);
      });
    }

    return response;
  }

  /**
   * 검색 내역 비동기 기록
   */
  private async recordSearchHistory(
    userId: string,
    query: SearchQuery,
    response: SearchResponse,
  ): Promise<void> {
    const searchType = this.mapSearchType(query.type);

    // 필터 정보 구성 (키워드 외 추가 필터가 있는 경우만)
    const filters: Record<string, any> = {};
    if (query.mimeType) filters.mimeType = query.mimeType;
    if (query.createdBy) filters.createdBy = query.createdBy;
    if (query.createdAtFrom) filters.createdAtFrom = query.createdAtFrom;
    if (query.createdAtTo) filters.createdAtTo = query.createdAtTo;

    const hasFilters = Object.keys(filters).length > 0;

    await this.searchHistoryDomainService.검색내역기록(
      userId,
      query.keyword,
      searchType,
      response.pagination.totalItems,
      hasFilters ? filters : undefined,
    );
  }

  /**
   * SearchResultType → SearchHistoryType 변환
   */
  private mapSearchType(type?: SearchResultType): SearchHistoryType {
    switch (type) {
      case SearchResultType.FILE:
        return SearchHistoryType.FILE;
      case SearchResultType.FOLDER:
        return SearchHistoryType.FOLDER;
      default:
        return SearchHistoryType.ALL;
    }
  }

  /**
   * 내 검색 내역 조회
   */
  async getSearchHistory(
    userId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<SearchHistoryResponse> {
    const offset = (page - 1) * pageSize;
    const { items, total } = await this.searchHistoryDomainService.검색내역조회(
      userId,
      pageSize,
      offset,
    );

    const historyItems: SearchHistoryItem[] = items.map((item) => ({
      id: item.id,
      keyword: item.keyword,
      searchType: item.searchType,
      filters: item.filters,
      resultCount: item.resultCount,
      searchedAt: item.searchedAt.toISOString(),
    }));

    return {
      items: historyItems,
      pagination: createPaginationInfo(page, pageSize, total),
    };
  }

  /**
   * 검색 내역 단건 삭제
   */
  async deleteSearchHistory(id: string, userId: string): Promise<void> {
    const deleted = await this.searchHistoryDomainService.검색내역삭제(id, userId);
    if (!deleted) {
      throw BusinessException.of(ErrorCodes.SEARCH_HISTORY_NOT_FOUND, { id, userId });
    }
  }

  /**
   * 전체 검색 내역 삭제
   */
  async deleteAllSearchHistory(userId: string): Promise<{ deletedCount: number }> {
    const deletedCount = await this.searchHistoryDomainService.전체검색내역삭제(userId);
    return { deletedCount };
  }

  /**
   * 폴더만 검색
   */
  private async searchFoldersOnly(
    keyword: string,
    sortBy: SortBy,
    sortOrder: SortOrder,
    page: number,
    pageSize: number,
    offset: number,
  ): Promise<SearchResponse> {
    const { items, total } = await this.folderDomainService.이름검색(
      keyword,
      pageSize,
      offset,
    );

    let results: SearchResultItem[] = items.map((folder) => ({
      id: folder.id,
      name: folder.name,
      type: SearchResultType.FOLDER as const,
      path: folder.path,
      parentId: folder.parentId,
      updatedAt: folder.updatedAt.toISOString(),
    }));

    results = this.sortResults(results, sortBy, sortOrder);

    return {
      results,
      pagination: createPaginationInfo(page, pageSize, total),
      keyword,
    };
  }

  /**
   * 파일만 검색
   */
  private async searchFilesOnly(
    keyword: string,
    sortBy: SortBy,
    sortOrder: SortOrder,
    page: number,
    pageSize: number,
    offset: number,
    filterOptions?: FileSearchFilterOptions,
  ): Promise<SearchResponse> {
    // 필터 옵션이 있으면 고급 검색 사용
    const { items, total } = await this.fileDomainService.고급검색(
      keyword,
      pageSize,
      offset,
      filterOptions,
    );

    // 파일의 경우 부모 폴더 경로 조회가 필요
    let results: SearchResultItem[] = [];
    for (const { file, createdByName } of items) {
      const folder = await this.folderDomainService.조회(file.folderId);
      results.push({
        id: file.id,
        name: file.name,
        type: SearchResultType.FILE as const,
        path: folder?.path ?? '/',
        folderId: file.folderId,
        size: file.sizeBytes,
        mimeType: file.mimeType,
        createdBy: file.createdBy,
        createdByName,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
      });
    }

    results = this.sortResults(results, sortBy, sortOrder);

    return {
      results,
      pagination: createPaginationInfo(page, pageSize, total),
      keyword,
    };
  }

  /**
   * 전체 검색 (폴더 + 파일)
   */
  private async searchAll(
    keyword: string,
    sortBy: SortBy,
    sortOrder: SortOrder,
    page: number,
    pageSize: number,
    offset: number,
    fileFilterOptions?: FileSearchFilterOptions,
  ): Promise<SearchResponse> {
    // 폴더와 파일 동시 검색 (각각 충분한 수량 조회)
    const [folderResult, fileResult] = await Promise.all([
      this.folderDomainService.이름검색(keyword, pageSize * 2, 0),
      this.fileDomainService.고급검색(keyword, pageSize * 2, 0, fileFilterOptions),
    ]);

    // 폴더 결과 변환
    const folderItems: SearchFolderItem[] = folderResult.items.map((folder) => ({
      id: folder.id,
      name: folder.name,
      type: SearchResultType.FOLDER as const,
      path: folder.path,
      parentId: folder.parentId,
      updatedAt: folder.updatedAt.toISOString(),
    }));

    // 파일 결과 변환 (부모 폴더 경로 조회)
    const fileItems: SearchFileItem[] = [];
    for (const { file, createdByName } of fileResult.items) {
      const folder = await this.folderDomainService.조회(file.folderId);
      fileItems.push({
        id: file.id,
        name: file.name,
        type: SearchResultType.FILE as const,
        path: folder?.path ?? '/',
        folderId: file.folderId,
        size: file.sizeBytes,
        mimeType: file.mimeType,
        createdBy: file.createdBy,
        createdByName,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
      });
    }

    // 전체 결과 합치고 정렬
    let results: SearchResultItem[] = [...folderItems, ...fileItems];
    results = this.sortResults(results, sortBy, sortOrder);

    // 페이지네이션 적용
    const totalItems = folderResult.total + fileResult.total;
    results = results.slice(offset, offset + pageSize);

    return {
      results,
      pagination: createPaginationInfo(page, pageSize, totalItems),
      keyword,
    };
  }

  /**
   * 검색 결과 정렬
   */
  private sortResults(
    items: SearchResultItem[],
    sortBy: SortBy,
    sortOrder: SortOrder,
  ): SearchResultItem[] {
    return [...items].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case SortBy.NAME:
          comparison = a.name.localeCompare(b.name);
          break;
        case SortBy.TYPE:
          comparison = a.type.localeCompare(b.type);
          break;
        case SortBy.UPDATED_AT:
        case SortBy.CREATED_AT:
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case SortBy.SIZE:
          const sizeA = a.type === SearchResultType.FILE ? (a as SearchFileItem).size : 0;
          const sizeB = b.type === SearchResultType.FILE ? (b as SearchFileItem).size : 0;
          comparison = sizeA - sizeB;
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }

      return sortOrder === SortOrder.DESC ? -comparison : comparison;
    });
  }
}
