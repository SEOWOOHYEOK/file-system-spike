/**
 * Folder TypeORM Entity
 * 폴더 테이블 매핑
 */
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('folders')
@Index(['parentId', 'name', 'state'])
export class FolderOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column('uuid', { nullable: true })
  @Index()
  parentId: string | null;

  @Column({ length: 1024 })
  @Index()
  path: string;

  @Column({
    type: 'enum',
    enum: ['ACTIVE', 'TRASHED', 'DELETED'],
    default: 'ACTIVE',
  })
  @Index()
  state: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
