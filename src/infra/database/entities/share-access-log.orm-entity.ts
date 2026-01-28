import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * ShareAccessLog ORM 엔티티
 *
 * share_access_logs 테이블과 매핑
 */
@Entity('share_access_logs')
export class ShareAccessLogOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'public_share_id', type: 'uuid' })
  @Index()
  publicShareId: string;

  @Column({ name: 'external_user_id', type: 'uuid' })
  @Index()
  externalUserId: string;

  @Column({ type: 'varchar', length: 20 })
  @Index()
  action: string; // 'VIEW' | 'DOWNLOAD'

  @Column({ name: 'ip_address', type: 'varchar', length: 45 })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'text' })
  userAgent: string;

  @Column({ name: 'device_type', type: 'varchar', length: 20 })
  deviceType: string;

  @CreateDateColumn({ name: 'accessed_at' })
  @Index()
  accessedAt: Date;

  @Column({ type: 'boolean' })
  @Index()
  success: boolean;

  @Column({ name: 'fail_reason', type: 'varchar', length: 50, nullable: true })
  failReason: string | null;
}
