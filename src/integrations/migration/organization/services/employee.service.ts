import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, DataSource } from 'typeorm';
import { Employee } from '../entities/employee.entity';


/**
 * 직원 서비스
 *
 * 직원 엔티티에 대한 CRUD 기능을 제공합니다.
 */
@Injectable()
export class DomainEmployeeService {
    constructor(
        @InjectRepository(Employee)
        private readonly repository: Repository<Employee>,
        private readonly dataSource: DataSource,
    ) {}

    private getRepository(manager?: EntityManager): Repository<Employee> {
        return manager ? manager.getRepository(Employee) : this.repository;
    }

    async save(entity: Employee, options?: { queryRunner?: any }): Promise<Employee> {
        const repository = options?.queryRunner
            ? options.queryRunner.manager.getRepository(Employee)
            : this.repository;
        return await repository.save(entity);
    }

    async findAll(manager?: EntityManager): Promise<Employee[]> {
        const repository = this.getRepository(manager);
        return await repository.find();
    }

    async findOne(id: string, manager?: EntityManager): Promise<Employee | null> {
        const repository = this.getRepository(manager);
        return await repository.findOne({ where: { id } });
    }
}
