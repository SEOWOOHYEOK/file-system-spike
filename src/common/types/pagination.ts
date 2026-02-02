/**
 * 공통 페이지네이션 타입
 */

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResult<T> extends PaginationInfo {
  items: T[];
}

/**
 * 페이지네이션 정보 생성
 */
export function createPaginationInfo(
  page: number,
  pageSize: number,
  totalItems: number,
): PaginationInfo {
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

/**
 * 페이지네이션된 결과 생성
 */
export function createPaginatedResult<T>(
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number,
): PaginatedResult<T> {
  return {
    items,
    ...createPaginationInfo(page, pageSize, totalItems),
  };
}
