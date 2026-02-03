import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * SecurityLog ORM 엔티티
 *
 * security_logs 테이블과 매핑
 *
 * 인덱스 설명:
 * - idx_security_event_time: 이벤트 타입별 조회
 * - idx_security_user_time: 사용자별 보안 로그
 * - idx_security_ip_time: IP별 조회
 * - idx_security_severity: 심각도별 조회
 */
@Entity('security_logs')
@Index('idx_security_event_time', ['eventType', 'createdAt'])
@Index('idx_security_user_time', ['userId', 'createdAt'])
@Index('idx_security_ip_time', ['ipAddress', 'createdAt'])
@Index('idx_security_severity', ['severity', 'createdAt'])
export class SecurityLogOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 추적 필드
  @Column({ name: 'request_id', type: 'varchar', length: 36 })
  @Index()
  requestId: string;

  @Column({ name: 'session_id', type: 'varchar', length: 36, nullable: true })
  @Index()
  sessionId: string | null;

  // 이벤트 필드
  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  @Index()
  eventType: string;

  @Column({ type: 'varchar', length: 10 })
  @Index()
  severity: string; // 'INFO' | 'WARN' | 'HIGH' | 'CRITICAL'

  // 주체 필드
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  @Index()
  userId: string | null;

  @Column({ name: 'user_type', type: 'varchar', length: 20, nullable: true })
  userType: string | null; // 'INTERNAL' | 'EXTERNAL'

  @Column({
    name: 'username_attempted',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  usernameAttempted: string | null;

  // 클라이언트 필드
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
  clientType: string | null;

  // 상세 정보
  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  // 시간 필드
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  @Index()
  createdAt: Date;
}
