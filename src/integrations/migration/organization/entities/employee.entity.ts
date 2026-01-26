import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
} from 'typeorm';
import { Rank } from './rank.entity';
import { EmployeeDepartmentPosition } from './employee-department-position.entity';

export enum Gender {
    Male = 'MALE',
    Female = 'FEMALE',
    Other = 'OTHER',
}

export enum EmployeeStatus {
    Active = '재직중',
    Leave = '휴직',
    Terminated = '퇴사',
}

@Entity('employees-info')
export class Employee {
    @PrimaryColumn({ type: 'uuid', comment: '직원 ID (외부 제공)' })
    id: string;

    @Column({ unique: true, comment: '사번' })
    employeeNumber: string;

    @Column({ comment: '이름' })
    name: string;

    @Column({ unique: true, comment: '이메일', nullable: true })
    email?: string;

    @Column({ comment: '비밀번호', nullable: true })
    password?: string;

    @Column({ comment: '전화번호', nullable: true })
    phoneNumber?: string;

    @Column({ comment: '생년월일', type: 'date', nullable: true })
    dateOfBirth?: Date;

    @Column({
        comment: '성별',
        type: 'enum',
        enum: Gender,
        nullable: true,
    })
    gender?: Gender;

    @Column({ comment: '입사일', type: 'date' })
    hireDate: Date;

    @Column({
        comment: '재직 상태',
        type: 'enum',
        enum: EmployeeStatus,
        default: EmployeeStatus.Active,
    })
    status: EmployeeStatus;

    @Column({ comment: '현재 직급 ID', type: 'uuid', nullable: true })
    currentRankId?: string;

    @ManyToOne(() => Rank)
    @JoinColumn({ name: 'currentRankId' })
    rank?: Rank;

    @Column({ comment: '퇴사일', type: 'date', nullable: true })
    terminationDate?: Date;

    @Column({ comment: '퇴사 사유', type: 'text', nullable: true })
    terminationReason?: string;

    @Column({ comment: '메타데이터', type: 'jsonb', nullable: true })
    metadata?: Record<string, any>;

    @Column({ comment: '초기 비밀번호로 설정되었는지 여부', default: true })
    isInitialPasswordSet: boolean;

    @OneToMany(() => EmployeeDepartmentPosition, (edp) => edp.employee)
    departmentPositions?: EmployeeDepartmentPosition[];

    @CreateDateColumn({ comment: '생성일' })
    createdAt: Date;

    @UpdateDateColumn({ comment: '수정일' })
    updatedAt: Date;
}
