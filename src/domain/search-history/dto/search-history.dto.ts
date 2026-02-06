/**
 * 검색 내역 관련 DTO
 */
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { PaginationInfo } from '../../../common/types/pagination';
import { SearchHistoryType } from '../entities/search-history.entity';

/**
 * 검색 내역 조회 쿼리 DTO
 */
export class SearchHistoryQuery {
  /** 페이지 번호 (1부터 시작) */
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: '페이지 번호는 정수여야 합니다.' })
  @Min(1, { message: '페이지 번호는 1 이상이어야 합니다.' })
  page?: number;

  /** 페이지 크기 (기본값: 20, 최대: 50) */
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: '페이지 크기는 정수여야 합니다.' })
  @Min(1, { message: '페이지 크기는 1 이상이어야 합니다.' })
  @Max(50, { message: '페이지 크기는 50 이하여야 합니다.' })
  pageSize?: number;
}

/**
 * 검색 내역 아이템
 */
export interface SearchHistoryItem {
  /** 검색 내역 ID */
  id: string;
  /** 검색 키워드 */
  keyword: string;
  /** 검색 대상 타입 */
  searchType: SearchHistoryType;
  /** 적용된 필터 */
  filters: Record<string, any> | null;
  /** 검색 결과 수 */
  resultCount: number;
  /** 검색 일시 (ISO 8601) */
  searchedAt: string;
}

/**
 * 검색 내역 응답 DTO
 */
export class SearchHistoryResponse {
  /** 검색 내역 목록 */
  items: SearchHistoryItem[];

  /** 페이지네이션 정보 */
  pagination: PaginationInfo;
}
