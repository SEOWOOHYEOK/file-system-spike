/**
 * Role 부여 DTO
 *
 * PATCH /users/:id/role 요청에 사용
 */
export class AssignRoleDto {
  /**
   * 부여할 Role의 ID
   */
  roleId: string;
}
