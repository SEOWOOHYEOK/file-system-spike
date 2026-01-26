import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { Employee } from './employee.entity';
import { Department } from './department.entity';
import { Position } from './position.entity';
import { Rank } from './rank.entity';

@Entity('employee_department_position_history')
@Index(['employeeId', 'effectiveStartDate', 'effectiveEndDate'])
@Index(['departmentId', 'effectiveStartDate', 'effectiveEndDate'])
@Index(['isCurrent', 'employeeId'], { where: '"isCurrent" = true' })
export class EmployeeDepartmentPositionHistory {
    @PrimaryGeneratedColumn('uuid')
    historyId: string;

    @Column({ comment: '직원 ID', type: 'uuid' })
    employeeId: string;

    @Column({ comment: '부서 ID', type: 'uuid' })
    departmentId: string;

    @Column({ comment: '해당 시점의 부서 상위 부서 ID (조직 계층 구조 추적용)', type: 'uuid', nullable: true })
    parentDepartmentId?: string;

    @Column({ comment: '직책 ID', type: 'uuid' })
    positionId: string;

    @Column({ comment: '직급 ID', type: 'uuid', nullable: true })
    rankId?: string;

    @Column({ comment: '관리자 권한 여부', type: 'boolean', default: false })
    isManager: boolean;

    @Column({
        type: 'date',
        comment: '발령 시작일 (이 배치가 유효해진 날짜)',
    })
    effectiveStartDate: string;

    @Column({
        type: 'date',
        nullable: true,
        comment: '발령 종료일 (NULL = 현재 유효)',
    })
    effectiveEndDate: string | null;

    @Column({
        type: 'boolean',
        default: true,
        comment: '현재 유효한 배치 여부',
    })
    isCurrent: boolean;

    @Column({
        type: 'text',
        nullable: true,
        comment: '발령 사유 (인사이동, 승진, 조직개편 등)',
    })
    assignmentReason?: string;

    @Column({
        type: 'uuid',
        nullable: true,
        comment: '발령자 ID',
    })
    assignedBy?: string;

    @CreateDateColumn({ comment: '이력 생성 시각' })
    createdAt: Date;

    // Relations
    @ManyToOne(() => Employee, { eager: false })
    @JoinColumn({ name: 'employeeId' })
    employee: Employee;

    @ManyToOne(() => Department, { eager: false })
    @JoinColumn({ name: 'departmentId' })
    department: Department;

    @ManyToOne(() => Department, { eager: false })
    @JoinColumn({ name: 'parentDepartmentId' })
    parentDepartment: Department;

    @ManyToOne(() => Position, { eager: false })
    @JoinColumn({ name: 'positionId' })
    position: Position;

    @ManyToOne(() => Rank, { eager: false, nullable: true })
    @JoinColumn({ name: 'rankId' })
    rank?: Rank;

    // Setter 메서드
    부서를설정한다(departmentId: string): void {
        this.departmentId = departmentId;
    }

    상위부서를설정한다(parentDepartmentId?: string): void {
        this.parentDepartmentId = parentDepartmentId;
    }

    직책을설정한다(positionId: string): void {
        this.positionId = positionId;
    }

    직급을설정한다(rankId?: string): void {
        this.rankId = rankId;
    }

    관리자권한을설정한다(isManager: boolean): void {
        this.isManager = isManager;
    }

    유효종료일을설정한다(effectiveEndDate: string): void {
        this.effectiveEndDate = effectiveEndDate;
        this.isCurrent = false;
    }

    현재유효상태로설정한다(): void {
        this.isCurrent = true;
        this.effectiveEndDate = null;
    }

    발령사유를설정한다(assignmentReason: string): void {
        this.assignmentReason = assignmentReason;
    }

    발령자를설정한다(assignedBy: string): void {
        this.assignedBy = assignedBy;
    }
}
