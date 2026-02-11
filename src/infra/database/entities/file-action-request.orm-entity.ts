import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('file_action_requests')
export class FileActionRequestOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  @Index()
  type: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  @Index()
  status: string;

  @Column({ name: 'file_id', type: 'uuid' })
  @Index()
  fileId: string;

  @Column({ name: 'file_name', type: 'varchar', length: 500 })
  fileName: string;

  @Column({ name: 'source_folder_id', type: 'uuid', nullable: true })
  sourceFolderId: string | null;

  @Column({ name: 'target_folder_id', type: 'uuid', nullable: true })
  targetFolderId: string | null;

  @Column({ name: 'requester_id', type: 'uuid' })
  @Index()
  requesterId: string;

  @Column({ name: 'designated_approver_id', type: 'uuid' })
  @Index()
  designatedApproverId: string;

  @Column({ name: 'approver_id', type: 'uuid', nullable: true })
  approverId: string | null;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'decision_comment', type: 'text', nullable: true })
  decisionComment: string | null;

  @Column({ name: 'snapshot_folder_id', type: 'uuid' })
  snapshotFolderId: string;

  @Column({ name: 'snapshot_file_state', type: 'varchar', length: 20 })
  snapshotFileState: string;

  @Column({ name: 'execution_note', type: 'text', nullable: true })
  executionNote: string | null;

  @CreateDateColumn({ name: 'requested_at' })
  requestedAt: Date;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'executed_at', type: 'timestamptz', nullable: true })
  executedAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at', nullable: true })
  updatedAt: Date | null;
}
