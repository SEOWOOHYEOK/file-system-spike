import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * AuditLog ORM 엔티티
 *
 * audit_logs 테이블과 매핑
 * - 풍부한 컨텍스트 필드 포함
 * - 비정규화로 JOIN 회피
 * - append-only (UPDATE/DELETE 금지)
 *
 * 인덱스 설명:
 * - idx_audit_user_time: 사용자별 최근 행위 (가장 빈번)
 * - idx_audit_target_time: 대상별 접근 이력
 * - idx_audit_action_time: 행위 유형별 조회
 * - idx_audit_user_action_time: 복합 - 사용자+행위+시간
 * - idx_audit_session: 세션별 조회
 * - idx_audit_ip_time: IP별 조회 (이상 접근 추적)
 * - idx_audit_device_user: 디바이스별 조회 (새 디바이스 감지)
 * - idx_audit_sensitivity_action: 기밀 파일 접근 조회
 * - idx_audit_result_fail: 실패 로그 조회 (보안 분석)
 */
@Entity('audit_logs')
// 복합 인덱스 (자주 사용되는 쿼리 패턴)
@Index('idx_audit_user_time', ['userId', 'createdAt'])
@Index('idx_audit_target_time', ['targetType', 'targetId', 'createdAt'])
@Index('idx_audit_action_time', ['action', 'createdAt'])
@Index('idx_audit_user_action_time', ['userId', 'action', 'createdAt'])
@Index('idx_audit_session', ['sessionId', 'createdAt'])
@Index('idx_audit_ip_time', ['ipAddress', 'createdAt'])
@Index('idx_audit_sensitivity_action', ['sensitivity', 'action', 'createdAt'])
@Index('idx_audit_result_fail', ['result', 'failReason', 'createdAt'])
export class AuditLogOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 추적 필드 (Correlation)
  @Column({ name: 'request_id', type: 'varchar', length: 36 })
  @Index()
  requestId: string;

  @Column({ name: 'session_id', type: 'varchar', length: 36, nullable: true })
  @Index()
  sessionId: string | null;

  @Column({ name: 'trace_id', type: 'varchar', length: 36, nullable: true })
  @Index()
  traceId: string | null;

  // 주체 필드 (Actor) - 비정규화
  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({ name: 'user_type', type: 'varchar', length: 20 })
  @Index()
  userType: string; // 'INTERNAL' | 'EXTERNAL'

  @Column({ name: 'user_name', type: 'varchar', length: 100, nullable: true })
  userName: string | null;

  @Column({ name: 'user_email', type: 'varchar', length: 255, nullable: true })
  userEmail: string | null;

  // 행위 필드 (Action)
  @Column({ type: 'varchar', length: 50 })
  @Index()
  action: string;

  @Column({ name: 'action_category', type: 'varchar', length: 20 })
  @Index()
  actionCategory: string; // 'file' | 'folder' | 'share' | 'auth' | 'admin'

  // 대상 필드 (Target) - 비정규화
  @Column({ name: 'target_type', type: 'varchar', length: 20 })
  @Index()
  targetType: string; // 'file' | 'folder' | 'share' | 'user'

  @Column({ name: 'target_id', type: 'uuid' })
  @Index()
  targetId: string;

  @Column({ name: 'target_name', type: 'varchar', length: 255, nullable: true })
  targetName: string | null;

  @Column({
    name: 'target_path',
    type: 'varchar',
    length: 1024,
    nullable: true,
  })
  targetPath: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  @Index()
  sensitivity: string | null; // 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL'

  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  @Index()
  ownerId: string | null;

  // 클라이언트 필드 (Client)
  @Column({ name: 'ip_address', type: 'varchar', length: 45 })
  @Index()
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'text' })
  userAgent: string;

  @Column({
    name: 'device_fingerprint',
    type: 'varchar',
    length: 64,
    nullable: true,
  })

  @Column({ name: 'client_type', type: 'varchar', length: 20, nullable: true })
  @Index()
  clientType: string | null; // 'web' | 'mobile' | 'api' | 'unknown'

  // 결과 필드 (Result)
  @Column({ type: 'varchar', length: 10 })
  @Index()
  result: string; // 'SUCCESS' | 'FAIL'

  @Column({ name: 'result_code', type: 'varchar', length: 50, nullable: true })
  @Index()
  resultCode: string | null;

  @Column({ name: 'fail_reason', type: 'varchar', length: 100, nullable: true })
  @Index()
  failReason: string | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs: number | null;

  // 확장 필드 (Extension)
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'varchar', array: true, nullable: true })
  tags: string[] | null;

  // API 컨텍스트 (신규)
  @Column({ name: 'http_method', type: 'varchar', length: 10, nullable: true })
  httpMethod: string | null;

  @Column({ name: 'api_endpoint', type: 'varchar', length: 255, nullable: true })
  apiEndpoint: string | null;

  // 인과관계 (신규)
  @Column({ name: 'parent_event_id', type: 'uuid', nullable: true })
  parentEventId: string | null;

  // 보안 이벤트 통합 (신규)
  @Column({ type: 'varchar', length: 10, nullable: true })
  severity: string | null; // 'INFO' | 'WARN' | 'HIGH' | 'CRITICAL'

  // 에러 추적 (신규)
  @Column({ name: 'error_code', type: 'varchar', length: 100, nullable: true })
  errorCode: string | null;

  // System Response (신규)
  @Column({
    name: 'response_status_code',
    type: 'integer',
    nullable: true,
  })
  responseStatusCode: number | null;

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

  // 재시도 (신규)
  @Column({ name: 'retry_count', type: 'integer', nullable: true })
  retryCount: number | null;

  // 인간 친화적 설명 (신규)
  @Column({ type: 'text', default: '' })
  description: string;

  // 동기화 추적 (신규)
  @Column({ name: 'sync_event_id', type: 'uuid', nullable: true })
  @Index()
  syncEventId: string | null;

  // 시간 필드 (Time)
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  @Index()
  createdAt: Date;
}
