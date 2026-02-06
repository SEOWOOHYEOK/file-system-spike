import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
} from 'typeorm';

@Entity('search_histories')
@Index('idx_search_histories_user_searched', ['userId', 'searchedAt'])
@Index('idx_search_histories_user_keyword', ['userId', 'keyword', 'searchType'])
export class SearchHistoryOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'varchar', length: 500 })
  keyword: string;

  @Column({ type: 'varchar', length: 20, default: 'all' })
  searchType: string;

  @Column({ type: 'jsonb', nullable: true })
  filters: Record<string, any> | null;

  @Column({ type: 'int', default: 0 })
  resultCount: number;

  @Column({ type: 'timestamptz' })
  searchedAt: Date;
}
