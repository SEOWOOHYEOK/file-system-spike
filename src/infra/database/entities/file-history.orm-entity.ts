import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * FileHistory ORM 엔티티
 *
 * file_histories 테이블과 매핑
 *
 * 인덱스 설명:
 * - idx_history_file_version: 파일별 버전 조회
 * - idx_history_file_time: 파일별 시간순 조회
 * - idx_history_user_time: 사용자별 변경 이력
 */
@Entity('file_histories')
@Index('idx_history_file_version', ['fileId', 'version'])
@Index('idx_history_file_time', ['fileId', 'createdAt'])
@Index('idx_history_user_time', ['changedBy', 'createdAt'])
export class FileHistoryOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'file_id', type: 'uuid' })
  @Index()
  fileId: string;

  @Column({ type: 'integer' })
  @Index()
  version: number;

  @Column({ name: 'change_type', type: 'varchar', length: 30 })
  @Index()
  changeType: string;

  @Column({ name: 'changed_by', type: 'uuid' })
  @Index()
  changedBy: string;

  @Column({ name: 'user_type', type: 'varchar', length: 20 })
  userType: string; // 'INTERNAL' | 'EXTERNAL'

  @Column({ name: 'previous_state', type: 'jsonb', nullable: true })
  previousState: Record<string, unknown> | null;

  @Column({ name: 'new_state', type: 'jsonb', nullable: true })
  newState: Record<string, unknown> | null;

  @Column({ name: 'checksum_before', type: 'varchar', length: 64, nullable: true })
  checksumBefore: string | null;

  @Column({ name: 'checksum_after', type: 'varchar', length: 64, nullable: true })
  checksumAfter: string | null;

  @Column({ name: 'change_summary', type: 'text', nullable: true })
  changeSummary: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  @Index()
  createdAt: Date;
}
