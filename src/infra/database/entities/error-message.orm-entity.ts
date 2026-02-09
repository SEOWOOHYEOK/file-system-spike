import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * ErrorMessage ORM 엔티티
 *
 * error_messages 테이블과 매핑
 * - 에러 코드와 메시지 매핑 저장
 * - 운영자가 런타임에 메시지 수정 가능
 */
@Entity('error_messages')
export class ErrorMessageOrmEntity {
  @PrimaryColumn({ name: 'error_code', type: 'integer' })
  errorCode: number;

  @Column({ name: 'internal_code', type: 'varchar', length: 100 })
  internalCode: string;

  @Column({ name: 'http_status', type: 'integer' })
  httpStatus: number;

  @Column({ name: 'default_message', type: 'varchar', length: 500 })
  defaultMessage: string;

  @Column({
    name: 'custom_message',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  customMessage: string | null;

  @Column({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'NOW()',
  })
  updatedAt: Date;

  @Column({
    name: 'updated_by',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  updatedBy: string | null;
}
