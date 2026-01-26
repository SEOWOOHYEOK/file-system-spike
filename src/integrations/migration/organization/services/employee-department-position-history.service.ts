import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, DataSource } from 'typeorm';
import { EmployeeDepartmentPositionHistory } from '../entities/employee-department-position-history.entity';

/**
 * 직원-부서-직책 이력 서비스
 *
 * 직원-부서-직책 이력 엔티티에 대한 CRUD 기능을 제공합니다.
 */
@Injectable()
export class DomainEmployeeDepartmentPositionHistoryService {
    constructor(
        @InjectRepository(EmployeeDepartmentPositionHistory)
        private readonly repository: Repository<EmployeeDepartmentPositionHistory>,
        private readonly dataSource: DataSource,
    ) {}

    private getRepository(manager?: EntityManager): Repository<EmployeeDepartmentPositionHistory> {
        return manager ? manager.getRepository(EmployeeDepartmentPositionHistory) : this.repository;
    }

    async save(
        entity: EmployeeDepartmentPositionHistory,
        options?: { queryRunner?: any },
    ): Promise<EmployeeDepartmentPositionHistory> {
        const repository = options?.queryRunner
            ? options.queryRunner.manager.getRepository(EmployeeDepartmentPositionHistory)
            : this.repository;
        return await repository.save(entity);
    }

    async findAll(manager?: EntityManager): Promise<EmployeeDepartmentPositionHistory[]> {
        const repository = this.getRepository(manager);
        return await repository.find();
    }

    async findOne(historyId: string, manager?: EntityManager): Promise<EmployeeDepartmentPositionHistory | null> {
        const repository = this.getRepository(manager);
        return await repository.findOne({ where: { historyId } });
    }

    async findCurrentByEmployeeId(employeeId: string): Promise<EmployeeDepartmentPositionHistory | null> {
        return this.repository
            .createQueryBuilder('eh')
            .leftJoinAndSelect('eh.department', 'dept')
            .leftJoinAndSelect('eh.position', 'pos')
            .leftJoinAndSelect('eh.rank', 'rank')
            .where('eh.employeeId = :employeeId', { employeeId })
            .andWhere('eh.isCurrent = :isCurrent', { isCurrent: true })
            .getOne();
    }

    async findHistoryByEmployeeId(employeeId: string): Promise<EmployeeDepartmentPositionHistory[]> {
        return this.repository
            .createQueryBuilder('eh')
            .leftJoinAndSelect('eh.department', 'dept')
            .leftJoinAndSelect('eh.position', 'pos')
            .leftJoinAndSelect('eh.rank', 'rank')
            .where('eh.employeeId = :employeeId', { employeeId })
            .orderBy('eh.effectiveStartDate', 'DESC')
            .getMany();
    }
}
