export class Permission {
  constructor(props: Partial<Permission>) {
    Object.assign(this, props);
  }
  id: string;
  code: string; // Matches PermissionEnum
  description?: string;
}
