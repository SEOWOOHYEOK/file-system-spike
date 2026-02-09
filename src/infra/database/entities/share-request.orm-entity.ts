import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * ShareRequest ORM 엔티티
 *
 * share_requests 테이블과 매핑
 */
@Entity('share_requests')
export class ShareRequestOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  @Index()
  status: string;

  @Column({ name: 'file_ids', type: 'uuid', array: true })
  fileIds: string[];

  @Column({ name: 'requester_id', type: 'uuid' })
  @Index()
  requesterId: string;

  @Column({ type: 'jsonb' })
  targets: any; // ShareTarget[] serialized as JSONB

  @Column({ type: 'jsonb' })
  permission: any; // Permission serialized as JSONB

  @Column({ name: 'start_at', type: 'timestamp' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'timestamp' })
  endAt: Date;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'approver_id', type: 'uuid', nullable: true })
  @Index()
  approverId: string | null;

  @Column({ name: 'decided_at', type: 'timestamp', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'decision_comment', type: 'text', nullable: true })
  decisionComment: string | null;

  @Column({ name: 'is_auto_approved', type: 'boolean', default: false })
  isAutoApproved: boolean;

  @Column({ name: 'public_share_ids', type: 'uuid', array: true, default: '{}' })
  publicShareIds: string[];

  @CreateDateColumn({ name: 'requested_at' })
  requestedAt: Date;

  @UpdateDateColumn({ name: 'updated_at', nullable: true })
  updatedAt: Date | null;
}
