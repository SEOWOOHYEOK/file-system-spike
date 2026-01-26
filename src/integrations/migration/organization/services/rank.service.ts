import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, DataSource } from 'typeorm';
import { Rank } from '../entities/rank.entity';

/**
 * 직급 서비스
 *
 * 직급 엔티티에 대한 CRUD 기능을 제공합니다.
 */
@Injectable()
export class DomainRankService {
    constructor(
        @InjectRepository(Rank)
        private readonly repository: Repository<Rank>,
        private readonly dataSource: DataSource,
    ) {}

    private getRepository(manager?: EntityManager): Repository<Rank> {
        return manager ? manager.getRepository(Rank) : this.repository;
    }

    async save(entity: Rank, options?: { queryRunner?: any }): Promise<Rank> {
        const repository = options?.queryRunner
            ? options.queryRunner.manager.getRepository(Rank)
            : this.repository;
        return await repository.save(entity);
    }

    async findAll(manager?: EntityManager): Promise<Rank[]> {
        const repository = this.getRepository(manager);
        return await repository.find();
    }

    async findOne(id: string, manager?: EntityManager): Promise<Rank | null> {
        const repository = this.getRepository(manager);
        return await repository.findOne({ where: { id } });
    }
}
