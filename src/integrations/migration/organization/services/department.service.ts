import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, DataSource } from 'typeorm';
import { Department } from '../entities/department.entity';

/**
 * 부서 서비스
 *
 * 부서 엔티티에 대한 CRUD 기능을 제공합니다.
 */
@Injectable()
export class DomainDepartmentService {
    constructor(
        @InjectRepository(Department)
        private readonly repository: Repository<Department>,
        private readonly dataSource: DataSource,
    ) {}

    private getRepository(manager?: EntityManager): Repository<Department> {
        return manager ? manager.getRepository(Department) : this.repository;
    }

    async save(entity: Department, options?: { queryRunner?: any }): Promise<Department> {
        const repository = options?.queryRunner
            ? options.queryRunner.manager.getRepository(Department)
            : this.repository;
        return await repository.save(entity);
    }

    async findAll(manager?: EntityManager): Promise<Department[]> {
        const repository = this.getRepository(manager);
        return await repository.find();
    }

    async findOne(id: string, manager?: EntityManager): Promise<Department | null> {
        const repository = this.getRepository(manager);
        return await repository.findOne({ where: { id } });
    }
}
