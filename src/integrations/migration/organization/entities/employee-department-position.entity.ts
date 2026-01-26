import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
    Unique,
} from 'typeorm';
import { Employee } from './employee.entity';
import { Department } from './department.entity';
import { Position } from './position.entity';

@Entity('employee_department_positions')
@Unique(['employeeId', 'departmentId']) // 한 직원이 같은 부서에서는 하나의 직책만 가능
@Index(['employeeId'])
@Index(['departmentId'])
@Index(['positionId'])
export class EmployeeDepartmentPosition {
    @PrimaryColumn({ type: 'uuid', comment: '직원-부서-직책 ID (외부 제공)' })
    id: string;

    @Column({ comment: '직원 ID', type: 'uuid' })
    employeeId: string;

    @Column({ comment: '부서 ID', type: 'uuid' })
    departmentId: string;

    @Column({ comment: '직책 ID', type: 'uuid' })
    positionId: string;

    @Column({ comment: '관리자 권한 여부', type: 'boolean', default: false })
    isManager: boolean;

    @CreateDateColumn({ comment: '생성일' })
    createdAt: Date;

    @UpdateDateColumn({ comment: '수정일' })
    updatedAt: Date;

    // 관계 설정
    @ManyToOne(() => Employee, { eager: false })
    @JoinColumn({ name: 'employeeId' })
    employee: Employee;

    @ManyToOne(() => Department, { eager: false })
    @JoinColumn({ name: 'departmentId' })
    department: Department;

    @ManyToOne(() => Position, { eager: false })
    @JoinColumn({ name: 'positionId' })
    position: Position;
}
