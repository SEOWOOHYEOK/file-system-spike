import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { SharePermission } from '../../../domain/share/share-permission.enum';

/**
 * FileShare ORM 엔티티
 *
 * file_shares 테이블과 매핑
 */
@Entity('file_shares')
export class FileShareOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'file_id', type: 'uuid' })
  @Index()
  fileId: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  @Index()
  ownerId: string;

  @Column({ name: 'recipient_id', type: 'uuid' })
  @Index()
  recipientId: string;

  @Column('simple-array')
  permissions: SharePermission[];

  @Column({ name: 'max_download_count', type: 'int', nullable: true })
  maxDownloadCount: number | null;

  @Column({ name: 'current_download_count', type: 'int', default: 0 })
  currentDownloadCount: number;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
