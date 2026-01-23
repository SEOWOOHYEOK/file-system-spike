/**
 * TrashMetadata TypeORM Entity
 * 휴지통 메타데이터 테이블 매핑
 */
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('trash_metadata')
export class TrashMetadataOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid', { nullable: true })
  @Index()
  fileId: string | null;

  @Column('uuid', { nullable: true })
  @Index()
  folderId: string | null;

  @Column({ length: 1024 })
  originalPath: string;

  @Column('uuid', { nullable: true })
  originalFolderId: string | null;

  @Column('uuid', { nullable: true })
  originalParentId: string | null;

  @Column({ length: 255 })
  deletedBy: string;

  @CreateDateColumn()
  deletedAt: Date;

  @Column('timestamp')
  @Index()
  expiresAt: Date;
}
