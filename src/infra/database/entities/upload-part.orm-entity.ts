/**
 * UploadPart TypeORM Entity
 * 멀티파트 업로드 파트 테이블 매핑
 */
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('upload_parts')
@Index(['sessionId', 'partNumber'], { unique: true })
export class UploadPartOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  sessionId: string;

  @Column('int')
  partNumber: number;

  @Column('bigint')
  size: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  etag: string | null;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'UPLOADING', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
  })
  status: string;
  

  @Column({ type: 'varchar', length: 500, nullable: true })
  objectKey: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
