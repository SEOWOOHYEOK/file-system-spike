import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('system_configs')
export class SystemConfigOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 500 })
  value: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  description: string;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'varchar', length: 100, default: '' })
  updatedBy: string;
}
