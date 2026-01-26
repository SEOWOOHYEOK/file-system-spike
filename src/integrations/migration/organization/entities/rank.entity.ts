import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ranks')
export class Rank {
    @PrimaryColumn({ type: 'uuid', comment: '직급 ID (외부 제공)' })
    id: string;

    @Column({ comment: '직급명 (예: 사원, 주임, 대리, 과장, 차장, 부장)' })
    rankTitle: string;

    @Column({ unique: true, comment: '직급 코드' })
    rankCode: string;

    @Column({ comment: '직급 레벨 (낮을수록 상위 직급)' })
    level: number;

    @CreateDateColumn({ comment: '생성일' })
    createdAt: Date;

    @UpdateDateColumn({ comment: '수정일' })
    updatedAt: Date;
}
