import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * TokenBlacklist ORM 엔티티
 *
 * 블랙리스트된 JWT 토큰을 DB에 저장합니다.
 * - token_hash: SHA-256 해시 (원문 저장 안 함)
 * - expires_at: 토큰 원래 만료 시간 (배치 정리 기준)
 */
@Entity('token_blacklist')
@Index('idx_token_blacklist_hash', ['tokenHash'], { unique: true })
@Index('idx_token_blacklist_expires', ['expiresAt'])
export class TokenBlacklistOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({ name: 'user_type', type: 'varchar', length: 20 })
  userType: string; // 'internal' | 'external'

  @Column({ type: 'varchar', length: 50 })
  reason: string; // 'logout' | 'password_change' | 'account_deactivated' | 'admin_revoke'

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
