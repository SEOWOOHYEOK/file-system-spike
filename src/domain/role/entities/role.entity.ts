import { Permission } from './permission.entity';

export class Role {
  constructor(props: Partial<Role>) {
    Object.assign(this, props);
  }
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
}
