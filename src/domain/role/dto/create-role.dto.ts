export class CreateRoleDto {
  name: string;
  description?: string;
  permissionCodes: string[];
}
