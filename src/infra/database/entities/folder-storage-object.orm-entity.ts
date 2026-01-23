/**
 * FolderStorageObject TypeORM Entity
 * 폴더 스토리지 객체 테이블 매핑
 */
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('folder_storage_objects')
@Index(['folderId'], { unique: true })
export class FolderStorageObjectOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  folderId: string;

  @Column({ length: 50, default: 'NAS' })
  storageType: string;

  @Column({ length: 1024 })
  objectKey: string;

  @Column({
    type: 'enum',
    enum: ['AVAILABLE', 'SYNCING', 'MOVING', 'ERROR'],
    default: 'AVAILABLE',
  })
  availabilityStatus: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
