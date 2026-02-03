import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('favorites')
@Unique(['userId', 'targetType', 'targetId'])
@Index('idx_favorites_user_time', ['userId', 'createdAt'])
export class FavoriteOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  targetType: string;

  @Column('uuid')
  targetId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
