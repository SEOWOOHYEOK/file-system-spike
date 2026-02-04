/**
 * File TypeORM Entity
 * 파일 테이블 매핑
 */
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('files')
@Index(['folderId', 'name', 'state'])
export class FileOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column('uuid')
  @Index()
  folderId: string;

  @Column('bigint')
  sizeBytes: number;

  @Column({ length: 255 })
  mimeType: string;

  @Column({
    type: 'enum',
    enum: ['ACTIVE', 'TRASHED', 'DELETED'],
    default: 'ACTIVE',
  })
  @Index()
  state: string;

  /** 파일 생성자 (업로더) ID */
  @Column('uuid')
  @Index()
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
