import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
} from 'typeorm';

/**
 * SystemEvent ORM 엔티티
 *
 * system_events 테이블과 매핑
 * - 시스템 자동 이벤트 기록
 * - append-only (UPDATE/DELETE 금지)
 *
 * 인덱스 설명:
 * - idx_system_event_time: 시간 범위 조회
 * - idx_system_event_component: 컴포넌트별 조회
 * - idx_system_event_trace: 트레이스 ID별 조회
 * - idx_system_event_target: 대상별 조회
 * - idx_system_event_severity: 심각도별 조회
 */
@Entity('system_events')
@Index('idx_system_event_time', ['occurredAt'])
@Index('idx_system_event_component', ['component', 'occurredAt'])
@Index('idx_system_event_trace', ['traceId', 'occurredAt'])
@Index('idx_system_event_target', ['targetId', 'occurredAt'])
@Index('idx_system_event_severity', ['severity', 'occurredAt'])
export class SystemEventOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  @Index()
  eventType: string;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'NOW()' })
  @Index()
  occurredAt: Date;

  @Column({ name: 'trace_id', type: 'varchar', length: 64, nullable: true })
  @Index()
  traceId: string | null;

  @Column({ name: 'parent_event_id', type: 'uuid', nullable: true })
  parentEventId: string | null;

  @Column({ name: 'actor_id', type: 'varchar', length: 36, default: 'SYSTEM' })
  actorId: string;

  @Column({ name: 'actor_name', type: 'varchar', length: 100 })
  actorName: string;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  @Index()
  targetId: string | null;

  @Column({ name: 'target_name', type: 'varchar', length: 255, nullable: true })
  targetName: string | null;

  @Column({ type: 'varchar', length: 10 })
  @Index()
  result: string; // 'SUCCESS' | 'FAILURE'

  @Column({ name: 'error_code', type: 'varchar', length: 100, nullable: true })
  errorCode: string | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs: number | null;

  @Column({ name: 'retry_count', type: 'integer', nullable: true })
  retryCount: number | null;

  @Column({ type: 'varchar', array: true, nullable: true })
  tags: string[] | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'system_action', type: 'varchar', length: 30, nullable: true })
  systemAction: string | null;

  @Column({
    name: 'system_action_detail',
    type: 'text',
    nullable: true,
  })
  systemActionDetail: string | null;

  @Column({
    name: 'follow_up_scheduled',
    type: 'boolean',
    nullable: true,
  })
  followUpScheduled: boolean | null;

  @Column({ name: 'follow_up_at', type: 'timestamptz', nullable: true })
  followUpAt: Date | null;

  @Column({ type: 'varchar', length: 50 })
  @Index()
  component: string;

  @Column({ type: 'varchar', length: 10 })
  @Index()
  severity: string; // 'INFO' | 'WARN' | 'HIGH' | 'CRITICAL'

  @Column({ name: 'previous_state', type: 'jsonb', nullable: true })
  previousState: Record<string, unknown> | null;

  @Column({ name: 'new_state', type: 'jsonb', nullable: true })
  newState: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
