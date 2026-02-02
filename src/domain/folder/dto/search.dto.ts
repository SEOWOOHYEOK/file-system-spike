/**
 * 검색 관련 DTO
 */
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationInfo, SortBy, SortOrder } from './folder-response.dto';

/**
 * 검색 결과 아이템 타입
 */
export enum SearchResultType {
  FILE = 'file',
  FOLDER = 'folder',
}

/**
 * 검색 쿼리 DTO
 */
export class SearchQuery {
  /** 검색 키워드 (최소 2자) */
  @IsString()
  @MinLength(2, { message: '검색어는 최소 2자 이상이어야 합니다.' })
  keyword: string;

  /** 검색 대상 타입 (미지정 시 전체 검색) */
  @IsOptional()
  @IsEnum(SearchResultType, {
    message: '검색 타입이 올바르지 않습니다. 허용 값: file, folder',
  })
  type?: SearchResultType;

  /** 정렬 기준 */
  @IsOptional()
  @IsEnum(SortBy, { message: '정렬 기준이 올바르지 않습니다.' })
  sortBy?: SortBy;

  /** 정렬 순서 */
  @IsOptional()
  @IsEnum(SortOrder, { message: '정렬 순서가 올바르지 않습니다.' })
  sortOrder?: SortOrder;

  /** 페이지 번호 (1부터 시작) */
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: '페이지 번호는 정수여야 합니다.' })
  @Min(1, { message: '페이지 번호는 1 이상이어야 합니다.' })
  page?: number;

  /** 페이지 크기 (기본값: 50, 최대: 100) */
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: '페이지 크기는 정수여야 합니다.' })
  @Min(1, { message: '페이지 크기는 1 이상이어야 합니다.' })
  @Max(100, { message: '페이지 크기는 100 이하여야 합니다.' })
  pageSize?: number;
}

/**
 * 검색 결과 - 폴더 아이템
 */
export interface SearchFolderItem {
  id: string;
  name: string;
  type: SearchResultType.FOLDER;
  /** 폴더의 전체 경로 */
  path: string;
  /** 부모 폴더 ID (루트인 경우 null) */
  parentId: string | null;
  updatedAt: string;
}

/**
 * 검색 결과 - 파일 아이템
 */
export interface SearchFileItem {
  id: string;
  name: string;
  type: SearchResultType.FILE;
  /** 파일이 위치한 폴더의 경로 */
  path: string;
  /** 파일이 속한 폴더 ID */
  folderId: string;
  /** 파일 크기 (bytes) */
  size: number;
  /** MIME 타입 */
  mimeType: string;
  updatedAt: string;
}

/**
 * 검색 결과 아이템 (Union Type)
 */
export type SearchResultItem = SearchFolderItem | SearchFileItem;

/**
 * 검색 응답 DTO
 */
export class SearchResponse {
  /** 검색 결과 목록 */
  results: SearchResultItem[];

  /** 페이지네이션 정보 */
  pagination: PaginationInfo;

  /** 검색어 */
  keyword: string;
}
