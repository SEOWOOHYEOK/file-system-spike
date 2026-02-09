import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { SharePermission } from '../../../domain/external-share/type/public-share.type';

/**
 * PublicShare ORM 엔티티
 *
 * public_shares 테이블과 매핑
 */
@Entity('public_shares')
export class PublicShareOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'file_id', type: 'uuid' })
  @Index()
  fileId: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  @Index()
  ownerId: string;

  @Column({ name: 'external_user_id', type: 'uuid', nullable: true })
  @Index()
  externalUserId: string | null;

  @Column('simple-array')
  permissions: SharePermission[];

  @Column({ name: 'max_view_count', type: 'int', nullable: true })
  maxViewCount: number | null;

  @Column({ name: 'current_view_count', type: 'int', default: 0 })
  currentViewCount: number;

  @Column({ name: 'max_download_count', type: 'int', nullable: true })
  maxDownloadCount: number | null;

  @Column({ name: 'current_download_count', type: 'int', default: 0 })
  currentDownloadCount: number;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'start_at', type: 'timestamp', nullable: true })
  startAt: Date | null;

  @Column({ name: 'internal_user_id', type: 'uuid', nullable: true })
  @Index()
  internalUserId: string | null;

  @Column({ name: 'is_blocked', type: 'boolean', default: false })
  @Index()
  isBlocked: boolean;

  @Column({ name: 'blocked_at', type: 'timestamp', nullable: true })
  blockedAt: Date | null;

  @Column({ name: 'blocked_by', type: 'uuid', nullable: true })
  blockedBy: string | null;

  @Column({ name: 'is_revoked', type: 'boolean', default: false })
  @Index()
  isRevoked: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
