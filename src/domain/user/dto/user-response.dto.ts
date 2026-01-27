/**
 * User 응답 DTO
 *
 * GET /users/:id 응답에 사용
 */
export class UserResponseDto {
  id: string;
  isActive: boolean;
  role: {
    id: string;
    name: string;
    permissions: string[];
  } | null;
  employee: {
    name: string;
    email: string;
    employeeNumber: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User 목록 응답 DTO
 *
 * GET /users 응답에 사용
 */
export class UserListResponseDto {
  users: UserResponseDto[];
  total: number;
}
