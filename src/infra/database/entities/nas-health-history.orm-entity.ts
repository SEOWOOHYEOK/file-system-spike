import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('nas_health_histories')
@Index('idx_nas_health_histories_checked_at', ['checkedAt'])
export class NasHealthHistoryOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'int' })
  responseTimeMs: number;

  @Column({ type: 'bigint' })
  totalBytes: number;

  @Column({ type: 'bigint' })
  usedBytes: number;

  @Column({ type: 'bigint' })
  freeBytes: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'timestamptz' })
  checkedAt: Date;
}
