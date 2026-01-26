import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, DataSource } from 'typeorm';
import { Position } from '../entities/position.entity';

/**
 * 직책 서비스
 *
 * 직책 엔티티에 대한 CRUD 기능을 제공합니다.
 */
@Injectable()
export class DomainPositionService {
    constructor(
        @InjectRepository(Position)
        private readonly repository: Repository<Position>,
        private readonly dataSource: DataSource,
    ) {}

    private getRepository(manager?: EntityManager): Repository<Position> {
        return manager ? manager.getRepository(Position) : this.repository;
    }

    async save(entity: Position, options?: { queryRunner?: any }): Promise<Position> {
        const repository = options?.queryRunner
            ? options.queryRunner.manager.getRepository(Position)
            : this.repository;
        return await repository.save(entity);
    }

    async findAll(manager?: EntityManager): Promise<Position[]> {
        const repository = this.getRepository(manager);
        return await repository.find();
    }

    async findOne(id: string, manager?: EntityManager): Promise<Position | null> {
        const repository = this.getRepository(manager);
        return await repository.findOne({ where: { id } });
    }
}
