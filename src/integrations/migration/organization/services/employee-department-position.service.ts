import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, DataSource } from 'typeorm';
import { EmployeeDepartmentPosition } from '../entities/employee-department-position.entity';

/**
 * 직원-부서-직책 서비스
 *
 * 직원-부서-직책 엔티티에 대한 CRUD 기능을 제공합니다.
 */
@Injectable()
export class DomainEmployeeDepartmentPositionService {
    constructor(
        @InjectRepository(EmployeeDepartmentPosition)
        private readonly repository: Repository<EmployeeDepartmentPosition>,
        private readonly dataSource: DataSource,
    ) {}

    private getRepository(manager?: EntityManager): Repository<EmployeeDepartmentPosition> {
        return manager ? manager.getRepository(EmployeeDepartmentPosition) : this.repository;
    }

    async save(
        entity: EmployeeDepartmentPosition,
        options?: { queryRunner?: any },
    ): Promise<EmployeeDepartmentPosition> {
        const repository = options?.queryRunner
            ? options.queryRunner.manager.getRepository(EmployeeDepartmentPosition)
            : this.repository;
        return await repository.save(entity);
    }

    async findAll(manager?: EntityManager): Promise<EmployeeDepartmentPosition[]> {
        const repository = this.getRepository(manager);
        return await repository.find();
    }

    async findOne(id: string, manager?: EntityManager): Promise<EmployeeDepartmentPosition | null> {
        const repository = this.getRepository(manager);
        return await repository.findOne({ where: { id } });
    }
}
