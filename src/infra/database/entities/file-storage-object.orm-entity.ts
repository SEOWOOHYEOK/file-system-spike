/**
 * FileStorageObject TypeORM Entity
 * 파일 스토리지 객체 테이블 매핑
 */
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('file_storage_objects')
@Index(['fileId', 'storageType'], { unique: true })
export class FileStorageObjectOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  fileId: string;

  @Column({
    type: 'enum',
    enum: ['CACHE', 'NAS'],
  })
  storageType: string;

  @Column({ length: 1024 })
  objectKey: string;

  @Column({
    type: 'enum',
    enum: ['AVAILABLE', 'SYNCING', 'MOVING', 'PENDING', 'MISSING', 'EVICTING', 'ERROR'],
    default: 'AVAILABLE',
  })
  availabilityStatus: string;

  @Column('timestamp', { nullable: true })
  lastAccessed: Date | null;

  @Column('int', { default: 0 })
  accessCount: number;

  @Column('int', { default: 0 })
  leaseCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
