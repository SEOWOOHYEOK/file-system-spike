import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    ManyToOne,
    JoinColumn,
    Unique,
    Index,
} from 'typeorm';

export enum DepartmentType {
    COMPANY = 'COMPANY',
    DIVISION = 'DIVISION',
    DEPARTMENT = 'DEPARTMENT',
    TEAM = 'TEAM',
}

@Entity('departments-info')
@Unique('UQ_departments_parent_order', ['parentDepartmentId', 'order'])
@Index('IDX_departments_parent_order', ['parentDepartmentId', 'order'])
@Index('UQ_departments_root_order', ['order'], {
    unique: true,
    where: '"parentDepartmentId" IS NULL',
})
export class Department {
    @PrimaryColumn({ type: 'uuid', comment: '부서 ID (외부 제공)' })
    id: string;

    @Column({ comment: '부서명' })
    departmentName: string;

    @Column({ unique: true, comment: '부서 코드' })
    departmentCode: string;

    @Column({ comment: '유형', type: 'enum', enum: DepartmentType, default: DepartmentType.DEPARTMENT })
    type: DepartmentType;

    @Column({ comment: '상위 부서 ID', type: 'uuid', nullable: true })
    parentDepartmentId?: string;

    @Column({ comment: '정렬 순서', default: 0 })
    order: number;

    // 부서 계층 구조
    @ManyToOne(() => Department, (department) => department.childDepartments, { nullable: true })
    @JoinColumn({ name: 'parentDepartmentId' })
    parentDepartment?: Department;

    @OneToMany(() => Department, (department) => department.parentDepartment)
    childDepartments: Department[];

    @CreateDateColumn({ comment: '생성일' })
    createdAt: Date;

    @UpdateDateColumn({ comment: '수정일' })
    updatedAt: Date;
}
