/**
 * UploadSession TypeORM Entity
 * 멀티파트 업로드 세션 테이블 매핑
 */
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('upload_sessions')
@Index(['folderId', 'status'])
@Index(['expiresAt', 'status'])
export class UploadSessionOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ length: 255 })
  fileName: string;

  @Column('uuid')
  @Index()
  folderId: string;

  @Column('bigint')
  totalSize: number;

  @Column('int')
  partSize: number;

  @Column('int')
  totalParts: number;

  @Column({ length: 255 })
  mimeType: string;

  @Column({
    type: 'enum',
    enum: ['INIT', 'UPLOADING', 'COMPLETING', 'COMPLETED', 'ABORTED', 'EXPIRED'],
    default: 'INIT',
  })
  @Index()
  status: string;

  @Column('bigint', { default: 0 })
  uploadedBytes: number;

  @Column('simple-json', { default: '[]' })
  completedParts: number[];

  @Column({ type: 'timestamp' })
  @Index()
  expiresAt: Date;

  @Column({ type: 'uuid', nullable: true })
  fileId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  uploadId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
