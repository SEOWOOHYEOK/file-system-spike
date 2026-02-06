import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchHistoryOrmEntity } from '../entities/search-history.orm-entity';
import {
  SearchHistoryEntity,
  SearchHistoryType,
} from '../../../domain/search-history/entities/search-history.entity';
import type { ISearchHistoryRepository } from '../../../domain/search-history/repositories/search-history.repository.interface';

@Injectable()
export class SearchHistoryRepository implements ISearchHistoryRepository {
  constructor(
    @InjectRepository(SearchHistoryOrmEntity)
    private readonly repository: Repository<SearchHistoryOrmEntity>,
  ) {}

  private toDomain(orm: SearchHistoryOrmEntity): SearchHistoryEntity {
    return new SearchHistoryEntity({
      id: orm.id,
      userId: orm.userId,
      keyword: orm.keyword,
      searchType: orm.searchType as SearchHistoryType,
      filters: orm.filters,
      resultCount: orm.resultCount,
      searchedAt: orm.searchedAt,
    });
  }

  private toOrm(domain: SearchHistoryEntity): SearchHistoryOrmEntity {
    const orm = new SearchHistoryOrmEntity();
    orm.id = domain.id;
    orm.userId = domain.userId;
    orm.keyword = domain.keyword;
    orm.searchType = domain.searchType;
    orm.filters = domain.filters;
    orm.resultCount = domain.resultCount;
    orm.searchedAt = domain.searchedAt;
    return orm;
  }

  async save(entity: SearchHistoryEntity): Promise<SearchHistoryEntity> {
    const orm = this.toOrm(entity);
    const saved = await this.repository.save(orm);
    return this.toDomain(saved);
  }

  async findByUserId(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: SearchHistoryEntity[]; total: number }> {
    const [orms, total] = await this.repository.findAndCount({
      where: { userId },
      order: { searchedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      items: orms.map((orm) => this.toDomain(orm)),
      total,
    };
  }

  async findByUserIdAndKeyword(
    userId: string,
    keyword: string,
    searchType: string,
  ): Promise<SearchHistoryEntity | null> {
    const orm = await this.repository.findOne({
      where: { userId, keyword, searchType },
    });
    return orm ? this.toDomain(orm) : null;
  }

  async deleteById(id: string, userId: string): Promise<boolean> {
    const result = await this.repository.delete({ id, userId });
    return (result.affected ?? 0) > 0;
  }

  async deleteAllByUserId(userId: string): Promise<number> {
    const result = await this.repository.delete({ userId });
    return result.affected ?? 0;
  }
}
