import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('positions')
export class Position {
    @PrimaryColumn({ type: 'uuid', comment: '직책 ID (외부 제공)' })
    id: string;

    @Column({ comment: '직책명 (예: 부서장, 파트장, 팀장, 직원)' })
    positionTitle: string;

    @Column({ unique: true, comment: '직책 코드 (예: DEPT_HEAD, PART_HEAD, TEAM_LEADER, STAFF)' })
    positionCode: string;

    @Column({ comment: '직책 레벨 (낮을수록 상위 직책)' })
    level: number;

    @Column({ comment: '관리 권한 여부', default: false })
    hasManagementAuthority: boolean;

    @CreateDateColumn({ comment: '생성일' })
    createdAt: Date;

    @UpdateDateColumn({ comment: '수정일' })
    updatedAt: Date;
}
