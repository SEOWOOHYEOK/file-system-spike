/**
 * 검색 비즈니스 서비스
 * 파일/폴더 통합 검색 기능 제공
 */
import { Injectable, Inject } from '@nestjs/common';
import {
  SearchQuery,
  SearchResponse,
  SearchResultItem,
  SearchResultType,
  SearchFolderItem,
  SearchFileItem,
  SortBy,
  SortOrder,
  PaginationInfo,
  FOLDER_REPOSITORY,
} from '../../domain/folder';
import type { IFolderRepository } from '../../domain/folder';
import { FILE_REPOSITORY } from '../../domain/file';
import type { IFileRepository } from '../../domain/file';

@Injectable()
export class SearchService {
  constructor(
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepository: IFolderRepository,
    @Inject(FILE_REPOSITORY)
    private readonly fileRepository: IFileRepository,
  ) {}

  /**
   * 파일/폴더 통합 검색
   */
  async search(query: SearchQuery): Promise<SearchResponse> {
    const {
      keyword,
      type,
      sortBy = SortBy.UPDATED_AT,
      sortOrder = SortOrder.DESC,
      page = 1,
      pageSize = 50,
    } = query;

    const offset = (page - 1) * pageSize;

    // 검색 타입에 따른 분기 처리
    if (type === SearchResultType.FOLDER) {
      return this.searchFoldersOnly(keyword, sortBy, sortOrder, page, pageSize, offset);
    }

    if (type === SearchResultType.FILE) {
      return this.searchFilesOnly(keyword, sortBy, sortOrder, page, pageSize, offset);
    }

    // 전체 검색 (폴더 + 파일)
    return this.searchAll(keyword, sortBy, sortOrder, page, pageSize, offset);
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
    const { items, total } = await this.folderRepository.searchByNamePattern(
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
      pagination: this.createPagination(page, pageSize, total),
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
  ): Promise<SearchResponse> {
    const { items, total } = await this.fileRepository.searchByNamePattern(
      keyword,
      pageSize,
      offset,
    );

    // 파일의 경우 부모 폴더 경로 조회가 필요
    let results: SearchResultItem[] = [];
    for (const file of items) {
      const folder = await this.folderRepository.findById(file.folderId);
      results.push({
        id: file.id,
        name: file.name,
        type: SearchResultType.FILE as const,
        path: folder?.path ?? '/',
        folderId: file.folderId,
        size: file.sizeBytes,
        mimeType: file.mimeType,
        updatedAt: file.updatedAt.toISOString(),
      });
    }

    results = this.sortResults(results, sortBy, sortOrder);

    return {
      results,
      pagination: this.createPagination(page, pageSize, total),
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
  ): Promise<SearchResponse> {
    // 폴더와 파일 동시 검색 (각각 충분한 수량 조회)
    const [folderResult, fileResult] = await Promise.all([
      this.folderRepository.searchByNamePattern(keyword, pageSize * 2, 0),
      this.fileRepository.searchByNamePattern(keyword, pageSize * 2, 0),
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
    for (const file of fileResult.items) {
      const folder = await this.folderRepository.findById(file.folderId);
      fileItems.push({
        id: file.id,
        name: file.name,
        type: SearchResultType.FILE as const,
        path: folder?.path ?? '/',
        folderId: file.folderId,
        size: file.sizeBytes,
        mimeType: file.mimeType,
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
      pagination: this.createPagination(page, pageSize, totalItems),
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

  /**
   * 페이지네이션 정보 생성
   */
  private createPagination(page: number, pageSize: number, totalItems: number): PaginationInfo {
    const totalPages = Math.ceil(totalItems / pageSize);
    return {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
}
