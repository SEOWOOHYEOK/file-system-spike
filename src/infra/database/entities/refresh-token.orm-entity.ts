import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * RefreshToken ORM 엔티티
 *
 * DMS-API 리프레시 토큰을 DB에 저장합니다.
 * - token_hash: SHA-256 해시 (원문 저장 안 함)
 * - family_id: 로테이션 체인 식별자 (탈취 감지용)
 * - is_used: 사용 여부 (로테이션 후 true)
 * - is_revoked: 강제 무효화 (로그아웃, 관리자 등)
 */
@Entity('refresh_tokens')
@Index('idx_refresh_token_hash', ['tokenHash'], { unique: true })
@Index('idx_refresh_token_family', ['familyId'])
@Index('idx_refresh_token_user', ['userId'])
@Index('idx_refresh_token_expires', ['expiresAt'])
export class RefreshTokenOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'user_type', type: 'varchar', length: 20 })
  userType: string; // 'internal' | 'external'

  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @Column({ name: 'is_used', type: 'boolean', default: false })
  isUsed: boolean;

  @Column({ name: 'is_revoked', type: 'boolean', default: false })
  isRevoked: boolean;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
