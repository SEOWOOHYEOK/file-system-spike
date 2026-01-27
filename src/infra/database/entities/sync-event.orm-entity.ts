import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 동기화 이벤트 ORM 엔티티
 */
@Entity('sync_events')
@Index('IDX_sync_events_status_created', ['status', 'createdAt'])
@Index('IDX_sync_events_file_id', ['fileId'])
@Index('IDX_sync_events_folder_id', ['folderId'])
@Index('IDX_sync_events_processed_at', ['processedAt'])
export class SyncEventOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'event_type',
  })
  eventType: string;

  @Column({
    type: 'varchar',
    length: 10,
    name: 'target_type',
  })
  targetType: string;

  @Column({
    type: 'uuid',
    name: 'file_id',
    nullable: true,
  })
  fileId: string | null;

  @Column({
    type: 'uuid',
    name: 'folder_id',
    nullable: true,
  })
  folderId: string | null;

  @Column({
    type: 'varchar',
    length: 1024,
    name: 'source_path',
  })
  sourcePath: string;

  @Column({
    type: 'varchar',
    length: 1024,
    name: 'target_path',
  })
  targetPath: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'PENDING',
  })
  status: string;

  @Column({
    type: 'int',
    name: 'retry_count',
    default: 0,
  })
  retryCount: number;

  @Column({
    type: 'int',
    name: 'max_retries',
    default: 3,
  })
  maxRetries: number;

  @Column({
    type: 'text',
    name: 'error_message',
    nullable: true,
  })
  errorMessage: string | null;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  metadata: Record<string, any> | null;

  @Column({
    type: 'timestamp',
    name: 'processed_at',
    nullable: true,
  })
  processedAt: Date | null;

  @CreateDateColumn({
    type: 'timestamp',
    name: 'created_at',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    name: 'updated_at',
  })
  updatedAt: Date;
}
