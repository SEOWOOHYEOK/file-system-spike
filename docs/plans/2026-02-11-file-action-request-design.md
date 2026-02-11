# File Action Request (파일 작업 요청/승인) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** User가 직접 이동/삭제할 수 없는 파일에 대해 Manager/Admin에게 요청 → 승인 → 자동실행하는 워크플로우를 구현한다.

**Architecture:** 낙관적 검증(Optimistic Validation) 방식. 요청 시 파일 상태 스냅샷을 저장하고, 승인 시 현재 상태와 비교하여 불일치하면 INVALIDATED 처리. 기존 `ShareRequest` 패턴을 그대로 따르되, 승인 시 `FileManageService.move()`/`delete()`를 위임 호출하여 실제 실행까지 자동 수행.

**Tech Stack:** NestJS, TypeORM (PostgreSQL), class-validator, uuid

---

## 설계 결정 사항

| 항목 | 결정 |
|---|---|
| 접근 방식 | 낙관적 검증 (승인 시 파일 상태 비교) |
| 범위 | 파일 이동 + 삭제 요청 (단일 엔티티, `type` 필드로 구분) |
| 승인자 | 요청 시 지정, 해당 권한 보유자만 후보 |
| 승인 후 | 즉시 자동 실행 → EXECUTED / INVALIDATED / FAILED |
| 만료 | 없음 (알림 인터페이스만 준비) |
| 중복 요청 | 같은 파일에 PENDING 있으면 차단 + 기존 요청 상세 노출 |
| 감사 로그 | 8개 AuditAction 신규 |
| 알림 | NotificationPort 인터페이스 + NoopAdapter |

## 상태 머신

```
PENDING ──→ APPROVED ──→ EXECUTED     (정상 완료)
   │              └──→ INVALIDATED   (상태 불일치)
   │              └──→ FAILED        (기술적 오류)
   ├──→ REJECTED                     (승인자 반려)
   └──→ CANCELED                     (요청자 취소)
```

---

## Task 1: Domain Layer — Enums & Entity

**Files:**
- Create: `src/domain/file-action-request/enums/file-action-type.enum.ts`
- Create: `src/domain/file-action-request/enums/file-action-request-status.enum.ts`
- Create: `src/domain/file-action-request/entities/file-action-request.entity.ts`
- Test: `src/domain/file-action-request/entities/file-action-request.entity.spec.ts`

**Step 1: Create enums**

```typescript
// src/domain/file-action-request/enums/file-action-type.enum.ts
export enum FileActionType {
  MOVE = 'MOVE',
  DELETE = 'DELETE',
}

// src/domain/file-action-request/enums/file-action-request-status.enum.ts
export enum FileActionRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELED = 'CANCELED',
  EXECUTED = 'EXECUTED',
  INVALIDATED = 'INVALIDATED',
  FAILED = 'FAILED',
}
```

**Step 2: Write the entity test**

```typescript
// src/domain/file-action-request/entities/file-action-request.entity.spec.ts
import { FileActionRequest } from './file-action-request.entity';
import { FileActionType } from '../enums/file-action-type.enum';
import { FileActionRequestStatus } from '../enums/file-action-request-status.enum';

describe('FileActionRequest', () => {
  const createPendingRequest = (overrides = {}) =>
    new FileActionRequest({
      id: 'req-1',
      type: FileActionType.MOVE,
      fileId: 'file-1',
      fileName: 'test.pdf',
      sourceFolderId: 'folder-a',
      targetFolderId: 'folder-b',
      requesterId: 'user-1',
      designatedApproverId: 'manager-1',
      reason: '정리 필요',
      snapshotFolderId: 'folder-a',
      snapshotFileStatus: 'ACTIVE',
      ...overrides,
    });

  describe('constructor defaults', () => {
    it('status defaults to PENDING', () => {
      const req = createPendingRequest();
      expect(req.status).toBe(FileActionRequestStatus.PENDING);
    });

    it('requestedAt defaults to now', () => {
      const req = createPendingRequest();
      expect(req.requestedAt).toBeInstanceOf(Date);
    });
  });

  describe('approve', () => {
    it('changes status to APPROVED', () => {
      const req = createPendingRequest();
      req.approve('manager-1', '승인합니다');
      expect(req.status).toBe(FileActionRequestStatus.APPROVED);
      expect(req.approverId).toBe('manager-1');
      expect(req.decisionComment).toBe('승인합니다');
      expect(req.decidedAt).toBeInstanceOf(Date);
    });

    it('throws if not PENDING', () => {
      const req = createPendingRequest();
      req.approve('manager-1');
      expect(() => req.approve('manager-1')).toThrow();
    });
  });

  describe('reject', () => {
    it('changes status to REJECTED with required comment', () => {
      const req = createPendingRequest();
      req.reject('manager-1', '사유 불충분');
      expect(req.status).toBe(FileActionRequestStatus.REJECTED);
      expect(req.decisionComment).toBe('사유 불충분');
    });

    it('throws without comment', () => {
      const req = createPendingRequest();
      expect(() => req.reject('manager-1', '')).toThrow();
    });
  });

  describe('cancel', () => {
    it('changes status to CANCELED', () => {
      const req = createPendingRequest();
      req.cancel();
      expect(req.status).toBe(FileActionRequestStatus.CANCELED);
    });
  });

  describe('validateStateForExecution', () => {
    it('returns true when state matches snapshot', () => {
      const req = createPendingRequest();
      req.approve('manager-1');
      expect(req.validateStateForExecution('folder-a', 'ACTIVE')).toBe(true);
    });

    it('returns false and marks INVALIDATED when folder changed', () => {
      const req = createPendingRequest();
      req.approve('manager-1');
      expect(req.validateStateForExecution('folder-c', 'ACTIVE')).toBe(false);
      expect(req.status).toBe(FileActionRequestStatus.INVALIDATED);
      expect(req.executionNote).toContain('folder-c');
    });

    it('returns false when file not ACTIVE', () => {
      const req = createPendingRequest();
      req.approve('manager-1');
      expect(req.validateStateForExecution('folder-a', 'TRASHED')).toBe(false);
      expect(req.status).toBe(FileActionRequestStatus.INVALIDATED);
    });
  });

  describe('markExecuted / markFailed', () => {
    it('markExecuted sets EXECUTED', () => {
      const req = createPendingRequest();
      req.approve('manager-1');
      req.markExecuted();
      expect(req.status).toBe(FileActionRequestStatus.EXECUTED);
      expect(req.executedAt).toBeInstanceOf(Date);
    });

    it('markFailed sets FAILED with reason', () => {
      const req = createPendingRequest();
      req.approve('manager-1');
      req.markFailed('NAS 연결 실패');
      expect(req.status).toBe(FileActionRequestStatus.FAILED);
      expect(req.executionNote).toBe('NAS 연결 실패');
    });
  });
});
```

**Step 3: Run test to verify it fails**

```bash
npx jest src/domain/file-action-request/entities/file-action-request.entity.spec.ts --no-coverage
```
Expected: FAIL (module not found)

**Step 4: Implement the entity**

```typescript
// src/domain/file-action-request/entities/file-action-request.entity.ts
import { FileActionType } from '../enums/file-action-type.enum';
import { FileActionRequestStatus } from '../enums/file-action-request-status.enum';

/**
 * FileActionRequest 도메인 엔티티 (Aggregate Root)
 *
 * 파일 이동/삭제 요청을 나타내는 엔티티
 * - User가 Manager/Admin에게 파일 작업을 요청
 * - 승인/반려/취소 상태 관리
 * - 승인 시 낙관적 검증 후 자동 실행
 */
export class FileActionRequest {
  id: string;
  type: FileActionType;
  status: FileActionRequestStatus;

  // 대상 파일
  fileId: string;
  fileName: string;

  // 이동 전용 (type=MOVE)
  sourceFolderId?: string;
  targetFolderId?: string;

  // 요청자/승인자
  requesterId: string;
  designatedApproverId: string;
  approverId?: string;

  // 사유/코멘트
  reason: string;
  decisionComment?: string;

  // 낙관적 검증 스냅샷
  snapshotFolderId: string;
  snapshotFileStatus: string;

  // 실행 결과
  executionNote?: string;

  // 타임스탬프
  requestedAt: Date;
  decidedAt?: Date;
  executedAt?: Date;
  updatedAt?: Date;

  constructor(props: Partial<FileActionRequest>) {
    Object.assign(this, props);
    this.status = this.status ?? FileActionRequestStatus.PENDING;
    this.requestedAt = this.requestedAt ?? new Date();
  }

  /** PENDING 상태인지 확인 */
  isDecidable(): boolean {
    return this.status === FileActionRequestStatus.PENDING;
  }

  /** APPROVED 상태인지 확인 */
  isExecutable(): boolean {
    return this.status === FileActionRequestStatus.APPROVED;
  }

  /** 승인 */
  approve(approverId: string, comment?: string): void {
    if (!this.isDecidable()) {
      throw new Error('Only PENDING requests can be approved');
    }
    this.status = FileActionRequestStatus.APPROVED;
    this.approverId = approverId;
    this.decidedAt = new Date();
    this.decisionComment = comment;
    this.updatedAt = new Date();
  }

  /** 반려 (comment 필수) */
  reject(approverId: string, comment: string): void {
    if (!this.isDecidable()) {
      throw new Error('Only PENDING requests can be rejected');
    }
    if (!comment || comment.trim().length === 0) {
      throw new Error('Rejection comment is required');
    }
    this.status = FileActionRequestStatus.REJECTED;
    this.approverId = approverId;
    this.decidedAt = new Date();
    this.decisionComment = comment;
    this.updatedAt = new Date();
  }

  /** 취소 */
  cancel(): void {
    if (!this.isDecidable()) {
      throw new Error('Only PENDING requests can be canceled');
    }
    this.status = FileActionRequestStatus.CANCELED;
    this.updatedAt = new Date();
  }

  /**
   * 낙관적 검증: 요청 시점 스냅샷과 현재 파일 상태 비교
   * 불일치 시 INVALIDATED로 전환
   */
  validateStateForExecution(currentFolderId: string, currentFileStatus: string): boolean {
    if (!this.isExecutable()) {
      throw new Error('Only APPROVED requests can be validated for execution');
    }

    if (this.snapshotFolderId !== currentFolderId) {
      this.status = FileActionRequestStatus.INVALIDATED;
      this.executionNote = `파일 위치 변경됨 (요청 시점: ${this.snapshotFolderId}, 현재: ${currentFolderId})`;
      this.updatedAt = new Date();
      return false;
    }

    if (currentFileStatus !== 'ACTIVE') {
      this.status = FileActionRequestStatus.INVALIDATED;
      this.executionNote = `파일 상태 변경됨 (요청 시점: ${this.snapshotFileStatus}, 현재: ${currentFileStatus})`;
      this.updatedAt = new Date();
      return false;
    }

    return true;
  }

  /** 실행 완료 */
  markExecuted(): void {
    if (!this.isExecutable()) {
      throw new Error('Only APPROVED requests can be marked as executed');
    }
    this.status = FileActionRequestStatus.EXECUTED;
    this.executedAt = new Date();
    this.updatedAt = new Date();
  }

  /** 실행 실패 */
  markFailed(reason: string): void {
    if (!this.isExecutable()) {
      throw new Error('Only APPROVED requests can be marked as failed');
    }
    this.status = FileActionRequestStatus.FAILED;
    this.executionNote = reason;
    this.updatedAt = new Date();
  }
}
```

**Step 5: Run test to verify it passes**

```bash
npx jest src/domain/file-action-request/entities/file-action-request.entity.spec.ts --no-coverage
```
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/domain/file-action-request/
git commit -m "feat(file-action-request): add domain entity with enums and tests"
```

---

## Task 2: Domain Layer — Repository Interface, Domain Service, Notification Port, Module

**Files:**
- Create: `src/domain/file-action-request/repositories/file-action-request.repository.interface.ts`
- Create: `src/domain/file-action-request/services/file-action-request-domain.service.ts`
- Create: `src/domain/file-action-request/ports/notification.port.ts`
- Create: `src/domain/file-action-request/file-action-request.module.ts`
- Create: `src/domain/file-action-request/index.ts`
- Modify: `src/domain/domain.module.ts` — import FileActionRequestDomainModule

**Step 1: Create repository interface**

```typescript
// src/domain/file-action-request/repositories/file-action-request.repository.interface.ts
import { FileActionRequest } from '../entities/file-action-request.entity';
import { FileActionRequestStatus } from '../enums/file-action-request-status.enum';
import { FileActionType } from '../enums/file-action-type.enum';
import type { PaginationParams, PaginatedResult } from '../../../common/types/pagination';

export interface FileActionRequestFilter {
  status?: FileActionRequestStatus;
  type?: FileActionType;
  requesterId?: string;
  fileId?: string;
  designatedApproverId?: string;
  requestedAtFrom?: Date;
  requestedAtTo?: Date;
}

export interface IFileActionRequestRepository {
  save(request: FileActionRequest): Promise<FileActionRequest>;
  findById(id: string): Promise<FileActionRequest | null>;
  findByFilter(
    filter: FileActionRequestFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<FileActionRequest>>;
  findByIds(ids: string[]): Promise<FileActionRequest[]>;
  countByStatus(): Promise<Record<FileActionRequestStatus, number>>;
  /** 같은 파일에 대한 PENDING 요청 조회 (중복 검사용) */
  findPendingByFileId(fileId: string): Promise<FileActionRequest | null>;
}

export const FILE_ACTION_REQUEST_REPOSITORY = Symbol('FILE_ACTION_REQUEST_REPOSITORY');
```

**Step 2: Create domain service** (follows ShareRequestDomainService pattern)

```typescript
// src/domain/file-action-request/services/file-action-request-domain.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { FileActionRequest } from '../entities/file-action-request.entity';
import { FileActionRequestStatus } from '../enums/file-action-request-status.enum';
import {
  FILE_ACTION_REQUEST_REPOSITORY,
  type IFileActionRequestRepository,
  type FileActionRequestFilter,
} from '../repositories/file-action-request.repository.interface';
import type { PaginatedResult, PaginationParams } from '../../../common/types/pagination';

@Injectable()
export class FileActionRequestDomainService {
  constructor(
    @Inject(FILE_ACTION_REQUEST_REPOSITORY)
    private readonly repository: IFileActionRequestRepository,
  ) {}

  async 저장(request: FileActionRequest): Promise<FileActionRequest> {
    return this.repository.save(request);
  }

  async 조회(id: string): Promise<FileActionRequest | null> {
    return this.repository.findById(id);
  }

  async 필터조회(
    filter: FileActionRequestFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<FileActionRequest>> {
    return this.repository.findByFilter(filter, pagination);
  }

  async 다건조회(ids: string[]): Promise<FileActionRequest[]> {
    return this.repository.findByIds(ids);
  }

  async 상태별카운트(): Promise<Record<FileActionRequestStatus, number>> {
    return this.repository.countByStatus();
  }

  async 파일PENDING조회(fileId: string): Promise<FileActionRequest | null> {
    return this.repository.findPendingByFileId(fileId);
  }
}
```

**Step 3: Create notification port**

```typescript
// src/domain/file-action-request/ports/notification.port.ts

export interface FileActionRequestNotificationPort {
  /** 승인자에게 새 요청 알림 */
  notifyNewRequest(params: {
    requestId: string;
    requesterId: string;
    approverId: string;
    actionType: string;
    fileName: string;
  }): Promise<void>;

  /** 요청자에게 승인/반려 결과 알림 */
  notifyDecision(params: {
    requestId: string;
    requesterId: string;
    actionType: string;
    decision: string;
    comment?: string;
  }): Promise<void>;

  /** 승인 대기 리마인더 */
  notifyReminder(params: {
    requestId: string;
    approverId: string;
    actionType: string;
    fileName: string;
    pendingSince: Date;
  }): Promise<void>;
}

export const FILE_ACTION_REQUEST_NOTIFICATION_PORT = Symbol('FILE_ACTION_REQUEST_NOTIFICATION_PORT');
```

**Step 4: Create domain module + index**

```typescript
// src/domain/file-action-request/file-action-request.module.ts
import { Module } from '@nestjs/common';
import { FileActionRequestDomainService } from './services/file-action-request-domain.service';
import { FileActionRequestInfraModule } from '../../infra/database/file-action-request-infra.module';

@Module({
  imports: [FileActionRequestInfraModule],
  providers: [FileActionRequestDomainService],
  exports: [FileActionRequestDomainService],
})
export class FileActionRequestDomainModule {}
```

```typescript
// src/domain/file-action-request/index.ts
export { FileActionRequest } from './entities/file-action-request.entity';
export { FileActionType } from './enums/file-action-type.enum';
export { FileActionRequestStatus } from './enums/file-action-request-status.enum';
export { FileActionRequestDomainService } from './services/file-action-request-domain.service';
export {
  FILE_ACTION_REQUEST_REPOSITORY,
  type IFileActionRequestRepository,
  type FileActionRequestFilter,
} from './repositories/file-action-request.repository.interface';
export {
  FILE_ACTION_REQUEST_NOTIFICATION_PORT,
  type FileActionRequestNotificationPort,
} from './ports/notification.port';
```

**Step 5: Modify `src/domain/domain.module.ts`**

Add `FileActionRequestDomainModule` to imports and exports.

**Step 6: Commit**

```bash
git add src/domain/file-action-request/ src/domain/domain.module.ts
git commit -m "feat(file-action-request): add domain service, repository interface, notification port"
```

---

## Task 3: Infra Layer — ORM Entity, Mapper, Repository, Module

**Files:**
- Create: `src/infra/database/entities/file-action-request.orm-entity.ts`
- Create: `src/infra/database/mapper/file-action-request.mapper.ts`
- Create: `src/infra/database/repositories/file-action-request.repository.ts`
- Create: `src/infra/database/file-action-request-infra.module.ts`
- Create: `src/infra/notification/noop-notification.adapter.ts`
- Modify: `src/infra/database/entities/index.ts` — export 추가

**Step 1: Create ORM entity**

```typescript
// src/infra/database/entities/file-action-request.orm-entity.ts
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('file_action_requests')
export class FileActionRequestOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  @Index()
  type: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  @Index()
  status: string;

  @Column({ name: 'file_id', type: 'uuid' })
  @Index()
  fileId: string;

  @Column({ name: 'file_name', type: 'varchar', length: 500 })
  fileName: string;

  @Column({ name: 'source_folder_id', type: 'uuid', nullable: true })
  sourceFolderId: string | null;

  @Column({ name: 'target_folder_id', type: 'uuid', nullable: true })
  targetFolderId: string | null;

  @Column({ name: 'requester_id', type: 'uuid' })
  @Index()
  requesterId: string;

  @Column({ name: 'designated_approver_id', type: 'uuid' })
  @Index()
  designatedApproverId: string;

  @Column({ name: 'approver_id', type: 'uuid', nullable: true })
  approverId: string | null;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'decision_comment', type: 'text', nullable: true })
  decisionComment: string | null;

  @Column({ name: 'snapshot_folder_id', type: 'uuid' })
  snapshotFolderId: string;

  @Column({ name: 'snapshot_file_status', type: 'varchar', length: 20 })
  snapshotFileStatus: string;

  @Column({ name: 'execution_note', type: 'text', nullable: true })
  executionNote: string | null;

  @CreateDateColumn({ name: 'requested_at' })
  requestedAt: Date;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'executed_at', type: 'timestamptz', nullable: true })
  executedAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at', nullable: true })
  updatedAt: Date | null;
}
```

**Step 2: Create mapper**

```typescript
// src/infra/database/mapper/file-action-request.mapper.ts
import { FileActionRequest } from '../../../domain/file-action-request/entities/file-action-request.entity';
import { FileActionRequestOrmEntity } from '../entities/file-action-request.orm-entity';

export class FileActionRequestMapper {
  static toDomain(orm: FileActionRequestOrmEntity): FileActionRequest {
    return new FileActionRequest({
      id: orm.id,
      type: orm.type as any,
      status: orm.status as any,
      fileId: orm.fileId,
      fileName: orm.fileName,
      sourceFolderId: orm.sourceFolderId ?? undefined,
      targetFolderId: orm.targetFolderId ?? undefined,
      requesterId: orm.requesterId,
      designatedApproverId: orm.designatedApproverId,
      approverId: orm.approverId ?? undefined,
      reason: orm.reason,
      decisionComment: orm.decisionComment ?? undefined,
      snapshotFolderId: orm.snapshotFolderId,
      snapshotFileStatus: orm.snapshotFileStatus,
      executionNote: orm.executionNote ?? undefined,
      requestedAt: orm.requestedAt,
      decidedAt: orm.decidedAt ?? undefined,
      executedAt: orm.executedAt ?? undefined,
      updatedAt: orm.updatedAt ?? undefined,
    });
  }

  static toOrm(domain: FileActionRequest): FileActionRequestOrmEntity {
    const orm = new FileActionRequestOrmEntity();
    orm.id = domain.id;
    orm.type = domain.type;
    orm.status = domain.status;
    orm.fileId = domain.fileId;
    orm.fileName = domain.fileName;
    orm.sourceFolderId = domain.sourceFolderId ?? null;
    orm.targetFolderId = domain.targetFolderId ?? null;
    orm.requesterId = domain.requesterId;
    orm.designatedApproverId = domain.designatedApproverId;
    orm.approverId = domain.approverId ?? null;
    orm.reason = domain.reason;
    orm.decisionComment = domain.decisionComment ?? null;
    orm.snapshotFolderId = domain.snapshotFolderId;
    orm.snapshotFileStatus = domain.snapshotFileStatus;
    orm.executionNote = domain.executionNote ?? null;
    orm.requestedAt = domain.requestedAt;
    orm.decidedAt = domain.decidedAt ?? null;
    orm.executedAt = domain.executedAt ?? null;
    orm.updatedAt = domain.updatedAt ?? null;
    return orm;
  }
}
```

**Step 3: Create repository** (follows ShareRequestRepository pattern)

```typescript
// src/infra/database/repositories/file-action-request.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { FileActionRequestOrmEntity } from '../entities/file-action-request.orm-entity';
import {
  IFileActionRequestRepository,
  FileActionRequestFilter,
} from '../../../domain/file-action-request/repositories/file-action-request.repository.interface';
import {
  type PaginationParams,
  type PaginatedResult,
  createPaginatedResult,
} from '../../../common/types/pagination';
import { FileActionRequest } from '../../../domain/file-action-request/entities/file-action-request.entity';
import { FileActionRequestMapper } from '../mapper/file-action-request.mapper';
import { FileActionRequestStatus } from '../../../domain/file-action-request/enums/file-action-request-status.enum';

@Injectable()
export class FileActionRequestRepository implements IFileActionRequestRepository {
  constructor(
    @InjectRepository(FileActionRequestOrmEntity)
    private readonly repo: Repository<FileActionRequestOrmEntity>,
  ) {}

  async save(request: FileActionRequest): Promise<FileActionRequest> {
    const orm = FileActionRequestMapper.toOrm(request);
    const saved = await this.repo.save(orm);
    return FileActionRequestMapper.toDomain(saved);
  }

  async findById(id: string): Promise<FileActionRequest | null> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? FileActionRequestMapper.toDomain(found) : null;
  }

  async findByFilter(
    filter: FileActionRequestFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<FileActionRequest>> {
    const { page, pageSize, sortBy = 'requestedAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * pageSize;
    const qb = this.repo.createQueryBuilder('far');

    if (filter.status) qb.andWhere('far.status = :status', { status: filter.status });
    if (filter.type) qb.andWhere('far.type = :type', { type: filter.type });
    if (filter.requesterId) qb.andWhere('far.requester_id = :requesterId', { requesterId: filter.requesterId });
    if (filter.fileId) qb.andWhere('far.file_id = :fileId', { fileId: filter.fileId });
    if (filter.designatedApproverId) qb.andWhere('far.designated_approver_id = :approverId', { approverId: filter.designatedApproverId });
    if (filter.requestedAtFrom) qb.andWhere('far.requested_at >= :from', { from: filter.requestedAtFrom });
    if (filter.requestedAtTo) qb.andWhere('far.requested_at <= :to', { to: filter.requestedAtTo });

    const col = this.mapSortColumn(sortBy);
    qb.orderBy(`far.${col}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');
    qb.skip(skip).take(pageSize);

    const [entities, totalItems] = await qb.getManyAndCount();
    return createPaginatedResult(entities.map(FileActionRequestMapper.toDomain), page, pageSize, totalItems);
  }

  async findByIds(ids: string[]): Promise<FileActionRequest[]> {
    if (ids.length === 0) return [];
    const found = await this.repo.find({ where: { id: In(ids) } });
    return found.map(FileActionRequestMapper.toDomain);
  }

  async countByStatus(): Promise<Record<FileActionRequestStatus, number>> {
    const results = await this.repo
      .createQueryBuilder('far')
      .select('far.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('far.status')
      .getRawMany();

    const counts = Object.values(FileActionRequestStatus).reduce(
      (acc, s) => ({ ...acc, [s]: 0 }),
      {} as Record<FileActionRequestStatus, number>,
    );
    results.forEach((r) => {
      if (r.status in counts) counts[r.status as FileActionRequestStatus] = parseInt(r.count, 10);
    });
    return counts;
  }

  async findPendingByFileId(fileId: string): Promise<FileActionRequest | null> {
    const found = await this.repo.findOne({
      where: { fileId, status: FileActionRequestStatus.PENDING },
    });
    return found ? FileActionRequestMapper.toDomain(found) : null;
  }

  private mapSortColumn(sortBy: string): string {
    const map: Record<string, string> = {
      requestedAt: 'requested_at',
      updatedAt: 'updated_at',
      decidedAt: 'decided_at',
      executedAt: 'executed_at',
      status: 'status',
      type: 'type',
    };
    return map[sortBy] || 'requested_at';
  }
}
```

**Step 4: Create noop notification adapter**

```typescript
// src/infra/notification/noop-notification.adapter.ts
import { Injectable, Logger } from '@nestjs/common';
import { FileActionRequestNotificationPort } from '../../domain/file-action-request/ports/notification.port';

/**
 * No-op 알림 어댑터 (추후 실제 알림 서비스로 교체)
 */
@Injectable()
export class NoopNotificationAdapter implements FileActionRequestNotificationPort {
  private readonly logger = new Logger(NoopNotificationAdapter.name);

  async notifyNewRequest(params: any): Promise<void> {
    this.logger.debug(`[NOOP] notifyNewRequest: ${JSON.stringify(params)}`);
  }

  async notifyDecision(params: any): Promise<void> {
    this.logger.debug(`[NOOP] notifyDecision: ${JSON.stringify(params)}`);
  }

  async notifyReminder(params: any): Promise<void> {
    this.logger.debug(`[NOOP] notifyReminder: ${JSON.stringify(params)}`);
  }
}
```

**Step 5: Create infra module**

```typescript
// src/infra/database/file-action-request-infra.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileActionRequestOrmEntity } from './entities/file-action-request.orm-entity';
import { FileActionRequestRepository } from './repositories/file-action-request.repository';
import { FILE_ACTION_REQUEST_REPOSITORY } from '../../domain/file-action-request/repositories/file-action-request.repository.interface';

@Module({
  imports: [TypeOrmModule.forFeature([FileActionRequestOrmEntity])],
  providers: [
    {
      provide: FILE_ACTION_REQUEST_REPOSITORY,
      useClass: FileActionRequestRepository,
    },
  ],
  exports: [FILE_ACTION_REQUEST_REPOSITORY],
})
export class FileActionRequestInfraModule {}
```

**Step 6: Modify `src/infra/database/entities/index.ts`** — export 추가

**Step 7: Commit**

```bash
git add src/infra/database/entities/file-action-request.orm-entity.ts \
        src/infra/database/mapper/file-action-request.mapper.ts \
        src/infra/database/repositories/file-action-request.repository.ts \
        src/infra/database/file-action-request-infra.module.ts \
        src/infra/database/entities/index.ts \
        src/infra/notification/
git commit -m "feat(file-action-request): add infra layer - ORM entity, mapper, repository, noop notification"
```

---

## Task 4: Audit Log Enums 확장

**Files:**
- Modify: `src/domain/audit/enums/audit-action.enum.ts`
- Modify: `src/domain/audit/enums/common.enum.ts`

**Step 1: Add AuditAction enum values**

`audit-action.enum.ts`에 추가:

```typescript
// 파일 작업 요청 관련
FILE_ACTION_REQUEST_MOVE_CREATE = 'FILE_ACTION_REQUEST_MOVE_CREATE',
FILE_ACTION_REQUEST_DELETE_CREATE = 'FILE_ACTION_REQUEST_DELETE_CREATE',
FILE_ACTION_REQUEST_CANCEL = 'FILE_ACTION_REQUEST_CANCEL',
FILE_ACTION_REQUEST_APPROVE = 'FILE_ACTION_REQUEST_APPROVE',
FILE_ACTION_REQUEST_REJECT = 'FILE_ACTION_REQUEST_REJECT',
FILE_ACTION_REQUEST_BULK_APPROVE = 'FILE_ACTION_REQUEST_BULK_APPROVE',
FILE_ACTION_REQUEST_BULK_REJECT = 'FILE_ACTION_REQUEST_BULK_REJECT',
FILE_ACTION_REQUEST_INVALIDATED = 'FILE_ACTION_REQUEST_INVALIDATED',
```

Description, Category 매핑도 추가.

**Step 2: Add TargetType**

`common.enum.ts`에 추가:

```typescript
FILE_ACTION_REQUEST = 'FILE_ACTION_REQUEST',
```

Description도 추가: `'파일 작업 요청'`

**Step 3: Commit**

```bash
git add src/domain/audit/enums/
git commit -m "feat(audit): add FILE_ACTION_REQUEST audit actions and target type"
```

---

## Task 5: Error Codes 추가

**Files:**
- Modify: `src/common/exceptions/error-codes.ts`

**Step 1: Add error codes** (10000~10099 범위)

```typescript
// ─── FileActionRequest 도메인 (10000~10099) ───

FILE_ACTION_REQUEST_NOT_FOUND: {
  code: 10001,
  internalCode: 'FILE_ACTION_REQUEST_NOT_FOUND',
  httpStatus: 404,
  defaultMessage: '파일 작업 요청을 찾을 수 없습니다.',
},

FILE_ACTION_REQUEST_DUPLICATE: {
  code: 10002,
  internalCode: 'FILE_ACTION_REQUEST_DUPLICATE',
  httpStatus: 409,
  defaultMessage: '해당 파일에 대해 이미 처리 대기 중인 요청이 있습니다.',
},

FILE_ACTION_REQUEST_NOT_APPROVABLE: {
  code: 10003,
  internalCode: 'FILE_ACTION_REQUEST_NOT_APPROVABLE',
  httpStatus: 400,
  defaultMessage: '승인할 수 없는 상태의 요청입니다.',
},

FILE_ACTION_REQUEST_NOT_REJECTABLE: {
  code: 10004,
  internalCode: 'FILE_ACTION_REQUEST_NOT_REJECTABLE',
  httpStatus: 400,
  defaultMessage: '반려할 수 없는 상태의 요청입니다.',
},

FILE_ACTION_REQUEST_NOT_CANCELLABLE: {
  code: 10005,
  internalCode: 'FILE_ACTION_REQUEST_NOT_CANCELLABLE',
  httpStatus: 400,
  defaultMessage: '취소할 수 없는 상태의 요청입니다.',
},

FILE_ACTION_REQUEST_NOT_OWNER: {
  code: 10006,
  internalCode: 'FILE_ACTION_REQUEST_NOT_OWNER',
  httpStatus: 403,
  defaultMessage: '본인의 요청만 취소할 수 있습니다.',
},

FILE_ACTION_REQUEST_INVALIDATED: {
  code: 10007,
  internalCode: 'FILE_ACTION_REQUEST_INVALIDATED',
  httpStatus: 409,
  defaultMessage: '파일 상태가 변경되어 요청을 실행할 수 없습니다.',
},

FILE_ACTION_REQUEST_EXECUTION_FAILED: {
  code: 10008,
  internalCode: 'FILE_ACTION_REQUEST_EXECUTION_FAILED',
  httpStatus: 500,
  defaultMessage: '파일 작업 실행 중 오류가 발생했습니다.',
},

FILE_ACTION_REQUEST_INVALID_APPROVER: {
  code: 10009,
  internalCode: 'FILE_ACTION_REQUEST_INVALID_APPROVER',
  httpStatus: 400,
  defaultMessage: '지정된 승인자가 승인 권한을 보유하고 있지 않습니다.',
},

FILE_ACTION_REQUEST_SOME_NOT_FOUND: {
  code: 10010,
  internalCode: 'FILE_ACTION_REQUEST_SOME_NOT_FOUND',
  httpStatus: 404,
  defaultMessage: '일부 요청을 찾을 수 없습니다.',
},
```

**Step 2: Commit**

```bash
git add src/common/exceptions/error-codes.ts
git commit -m "feat(error-codes): add FileActionRequest error codes (10000-10099)"
```

---

## Task 6: Business Layer — Command Service

**Files:**
- Create: `src/business/file-action-request/file-action-request-command.service.ts`
- Create: `src/business/file-action-request/file-action-request-validation.service.ts`

**Step 1: Create validation service**

```typescript
// src/business/file-action-request/file-action-request-validation.service.ts
import { Injectable } from '@nestjs/common';
import { FileActionRequestDomainService } from '../../domain/file-action-request/services/file-action-request-domain.service';
import { FileDomainService } from '../../domain/file/service/file-domain.service';
import { FolderDomainService } from '../../domain/folder/service/folder-domain.service';
import { UserService } from '../user/user.service';
import { PermissionEnum } from '../../domain/role/permission.enum';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import { FileActionType } from '../../domain/file-action-request/enums/file-action-type.enum';

@Injectable()
export class FileActionRequestValidationService {
  constructor(
    private readonly domainService: FileActionRequestDomainService,
    private readonly fileDomainService: FileDomainService,
    private readonly folderDomainService: FolderDomainService,
    private readonly userService: UserService,
  ) {}

  /** 파일 존재+활성 검증 */
  async validateFile(fileId: string) {
    const file = await this.fileDomainService.조회(fileId);
    if (!file || !file.isActive()) {
      throw BusinessException.of(ErrorCodes.FILE_NOT_FOUND, { fileId });
    }
    return file;
  }

  /** 대상 폴더 존재+활성 검증 (MOVE) */
  async validateTargetFolder(folderId: string) {
    const folder = await this.folderDomainService.조회(folderId);
    if (!folder || !folder.isActive()) {
      throw BusinessException.of(ErrorCodes.FOLDER_NOT_FOUND, { folderId });
    }
    return folder;
  }

  /** 중복 PENDING 요청 검사 */
  async checkDuplicate(fileId: string) {
    const existing = await this.domainService.파일PENDING조회(fileId);
    if (existing) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_DUPLICATE, {
        existingRequestId: existing.id,
        requesterId: existing.requesterId,
        type: existing.type,
        designatedApproverId: existing.designatedApproverId,
        fileName: existing.fileName,
        requestedAt: existing.requestedAt,
        ...(existing.targetFolderId ? { targetFolderId: existing.targetFolderId } : {}),
      });
    }
  }

  /** 지정 승인자가 해당 권한을 가지고 있는지 검증 */
  async validateApprover(approverId: string, actionType: FileActionType) {
    const { user, role } = await this.userService.findByIdWithRole(approverId);
    if (!user.isActive || !role) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_INVALID_APPROVER, { approverId });
    }
    const requiredPermission = actionType === FileActionType.MOVE
      ? PermissionEnum.FILE_MOVE_APPROVE
      : PermissionEnum.FILE_DELETE_APPROVE;
    const hasPermission = role.permissions.some((p) => p.code === requiredPermission);
    if (!hasPermission) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_INVALID_APPROVER, {
        approverId,
        requiredPermission,
      });
    }
  }
}
```

**Step 2: Create command service**

핵심 로직: 승인 시 낙관적 검증 → `FileManageService.move()` / `delete()` 위임

```typescript
// src/business/file-action-request/file-action-request-command.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { FileActionRequest } from '../../domain/file-action-request/entities/file-action-request.entity';
import { FileActionType } from '../../domain/file-action-request/enums/file-action-type.enum';
import { FileActionRequestDomainService } from '../../domain/file-action-request/services/file-action-request-domain.service';
import { FileActionRequestValidationService } from './file-action-request-validation.service';
import { FileManageService } from '../file/file-manage.service';
import { FileDomainService } from '../../domain/file/service/file-domain.service';
import {
  FILE_ACTION_REQUEST_NOTIFICATION_PORT,
  type FileActionRequestNotificationPort,
} from '../../domain/file-action-request/ports/notification.port';
import { BusinessException, ErrorCodes } from '../../common/exceptions';

export interface CreateMoveRequestDto {
  fileId: string;
  targetFolderId: string;
  reason: string;
  designatedApproverId: string;
}

export interface CreateDeleteRequestDto {
  fileId: string;
  reason: string;
  designatedApproverId: string;
}

@Injectable()
export class FileActionRequestCommandService {
  private readonly logger = new Logger(FileActionRequestCommandService.name);

  constructor(
    private readonly domainService: FileActionRequestDomainService,
    private readonly validationService: FileActionRequestValidationService,
    private readonly fileManageService: FileManageService,
    private readonly fileDomainService: FileDomainService,
    @Inject(FILE_ACTION_REQUEST_NOTIFICATION_PORT)
    private readonly notificationPort: FileActionRequestNotificationPort,
  ) {}

  /** 이동 요청 생성 */
  async createMoveRequest(requesterId: string, dto: CreateMoveRequestDto): Promise<FileActionRequest> {
    const file = await this.validationService.validateFile(dto.fileId);
    await this.validationService.validateTargetFolder(dto.targetFolderId);
    await this.validationService.checkDuplicate(dto.fileId);
    await this.validationService.validateApprover(dto.designatedApproverId, FileActionType.MOVE);

    const request = new FileActionRequest({
      id: uuidv4(),
      type: FileActionType.MOVE,
      fileId: dto.fileId,
      fileName: file.name,
      sourceFolderId: file.folderId,
      targetFolderId: dto.targetFolderId,
      requesterId,
      designatedApproverId: dto.designatedApproverId,
      reason: dto.reason,
      snapshotFolderId: file.folderId,
      snapshotFileStatus: file.status,
    });

    const saved = await this.domainService.저장(request);

    await this.notificationPort.notifyNewRequest({
      requestId: saved.id,
      requesterId,
      approverId: dto.designatedApproverId,
      actionType: 'MOVE',
      fileName: file.name,
    });

    return saved;
  }

  /** 삭제 요청 생성 */
  async createDeleteRequest(requesterId: string, dto: CreateDeleteRequestDto): Promise<FileActionRequest> {
    const file = await this.validationService.validateFile(dto.fileId);
    await this.validationService.checkDuplicate(dto.fileId);
    await this.validationService.validateApprover(dto.designatedApproverId, FileActionType.DELETE);

    const request = new FileActionRequest({
      id: uuidv4(),
      type: FileActionType.DELETE,
      fileId: dto.fileId,
      fileName: file.name,
      sourceFolderId: file.folderId,
      requesterId,
      designatedApproverId: dto.designatedApproverId,
      reason: dto.reason,
      snapshotFolderId: file.folderId,
      snapshotFileStatus: file.status,
    });

    const saved = await this.domainService.저장(request);

    await this.notificationPort.notifyNewRequest({
      requestId: saved.id,
      requesterId,
      approverId: dto.designatedApproverId,
      actionType: 'DELETE',
      fileName: file.name,
    });

    return saved;
  }

  /** 요청 취소 */
  async cancelRequest(requestId: string, userId: string): Promise<FileActionRequest> {
    const request = await this.getOrThrow(requestId);

    if (request.requesterId !== userId) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_NOT_OWNER, { requestId, userId });
    }
    if (!request.isDecidable()) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_NOT_CANCELLABLE, {
        requestId, currentStatus: request.status,
      });
    }

    request.cancel();
    return await this.domainService.저장(request);
  }

  /**
   * 승인 (즉시 실행)
   *
   * 1. 요청 조회 + PENDING 확인
   * 2. approve()
   * 3. 낙관적 검증 (현재 파일 상태 vs 스냅샷)
   * 4. 실행 (FileManageService 위임)
   * 5. markExecuted / markFailed / INVALIDATED
   */
  async approveRequest(requestId: string, approverId: string, comment?: string): Promise<FileActionRequest> {
    const request = await this.getOrThrow(requestId);

    if (!request.isDecidable()) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_NOT_APPROVABLE, {
        requestId, currentStatus: request.status,
      });
    }

    request.approve(approverId, comment);

    // 낙관적 검증
    const file = await this.fileDomainService.조회(request.fileId);
    if (!file) {
      request.status = (await import('../../domain/file-action-request/enums/file-action-request-status.enum')).FileActionRequestStatus.INVALIDATED;
      request.executionNote = '파일이 삭제되었습니다.';
      request.updatedAt = new Date();
      const saved = await this.domainService.저장(request);

      await this.notificationPort.notifyDecision({
        requestId, requesterId: request.requesterId,
        actionType: request.type, decision: 'INVALIDATED',
        comment: request.executionNote,
      });
      return saved;
    }

    const isValid = request.validateStateForExecution(file.folderId, file.status);
    if (!isValid) {
      const saved = await this.domainService.저장(request);

      await this.notificationPort.notifyDecision({
        requestId, requesterId: request.requesterId,
        actionType: request.type, decision: 'INVALIDATED',
        comment: request.executionNote,
      });
      return saved;
    }

    // 실행
    try {
      if (request.type === FileActionType.MOVE) {
        await this.fileManageService.move(
          request.fileId,
          { targetFolderId: request.targetFolderId! },
          approverId,
        );
      } else {
        await this.fileManageService.delete(request.fileId, approverId);
      }
      request.markExecuted();
    } catch (error) {
      this.logger.error(`파일 작업 실행 실패: ${requestId}`, error);
      request.markFailed(error.message || '실행 중 오류 발생');
    }

    const saved = await this.domainService.저장(request);

    await this.notificationPort.notifyDecision({
      requestId, requesterId: request.requesterId,
      actionType: request.type,
      decision: request.status,
      comment,
    });

    return saved;
  }

  /** 반려 */
  async rejectRequest(requestId: string, approverId: string, comment: string): Promise<FileActionRequest> {
    const request = await this.getOrThrow(requestId);

    if (!request.isDecidable()) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_NOT_REJECTABLE, {
        requestId, currentStatus: request.status,
      });
    }

    request.reject(approverId, comment);
    const saved = await this.domainService.저장(request);

    await this.notificationPort.notifyDecision({
      requestId, requesterId: request.requesterId,
      actionType: request.type, decision: 'REJECTED', comment,
    });

    return saved;
  }

  /** 일괄 승인 */
  async bulkApprove(ids: string[], approverId: string, comment?: string): Promise<FileActionRequest[]> {
    const results: FileActionRequest[] = [];
    for (const id of ids) {
      const result = await this.approveRequest(id, approverId, comment);
      results.push(result);
    }
    return results;
  }

  /** 일괄 반려 */
  async bulkReject(ids: string[], approverId: string, comment: string): Promise<FileActionRequest[]> {
    const results: FileActionRequest[] = [];
    for (const id of ids) {
      const result = await this.rejectRequest(id, approverId, comment);
      results.push(result);
    }
    return results;
  }

  private async getOrThrow(requestId: string): Promise<FileActionRequest> {
    const request = await this.domainService.조회(requestId);
    if (!request) {
      throw BusinessException.of(ErrorCodes.FILE_ACTION_REQUEST_NOT_FOUND, { requestId });
    }
    return request;
  }
}
```

**Step 3: Commit**

```bash
git add src/business/file-action-request/
git commit -m "feat(file-action-request): add command and validation services"
```

---

## Task 7: Business Layer — Query Service & Module

**Files:**
- Create: `src/business/file-action-request/file-action-request-query.service.ts`
- Create: `src/business/file-action-request/file-action-request.module.ts`
- Create: `src/business/file-action-request/index.ts`
- Modify: `src/business/business.module.ts` — import FileActionRequestModule

**Step 1: Create query service**

```typescript
// src/business/file-action-request/file-action-request-query.service.ts
import { Injectable } from '@nestjs/common';
import { FileActionRequestDomainService } from '../../domain/file-action-request/services/file-action-request-domain.service';
import { FileActionRequestStatus } from '../../domain/file-action-request/enums/file-action-request-status.enum';
import { FileActionType } from '../../domain/file-action-request/enums/file-action-type.enum';
import { UserService } from '../user/user.service';
import { PermissionEnum } from '../../domain/role/permission.enum';
import type { FileActionRequestFilter } from '../../domain/file-action-request/repositories/file-action-request.repository.interface';
import type { PaginationParams } from '../../common/types/pagination';

@Injectable()
export class FileActionRequestQueryService {
  constructor(
    private readonly domainService: FileActionRequestDomainService,
    private readonly userService: UserService,
  ) {}

  async getMyRequests(userId: string, filter: FileActionRequestFilter, pagination: PaginationParams) {
    return this.domainService.필터조회({ ...filter, requesterId: userId }, pagination);
  }

  async getMyPendingApprovals(approverId: string, pagination: PaginationParams) {
    return this.domainService.필터조회(
      { designatedApproverId: approverId, status: FileActionRequestStatus.PENDING },
      pagination,
    );
  }

  async getAllRequests(filter: FileActionRequestFilter, pagination: PaginationParams) {
    return this.domainService.필터조회(filter, pagination);
  }

  async getRequestDetail(id: string) {
    return this.domainService.조회(id);
  }

  async getSummary() {
    return this.domainService.상태별카운트();
  }

  /** 승인 가능 사용자 목록 (해당 권한 보유자) */
  async getApprovers(type: FileActionType) {
    const permission = type === FileActionType.MOVE
      ? PermissionEnum.FILE_MOVE_APPROVE
      : PermissionEnum.FILE_DELETE_APPROVE;
    return this.userService.findUsersByPermission(permission);
  }
}
```

**Note:** `UserService.findUsersByPermission(permission)` 메서드가 없을 수 있음. Task 8에서 추가.

**Step 2: Create module**

```typescript
// src/business/file-action-request/file-action-request.module.ts
import { Module } from '@nestjs/common';
import { FileActionRequestDomainModule } from '../../domain/file-action-request/file-action-request.module';
import { FileActionRequestInfraModule } from '../../infra/database/file-action-request-infra.module';
import { FileDomainModule } from '../../domain/file/file.module';
import { FolderDomainModule } from '../../domain/folder/folder.module';
import { FileBusinessModule } from '../file/file.module';
import { UserModule } from '../user/user.module';
import { FILE_ACTION_REQUEST_NOTIFICATION_PORT } from '../../domain/file-action-request/ports/notification.port';
import { NoopNotificationAdapter } from '../../infra/notification/noop-notification.adapter';
import { FileActionRequestCommandService } from './file-action-request-command.service';
import { FileActionRequestQueryService } from './file-action-request-query.service';
import { FileActionRequestValidationService } from './file-action-request-validation.service';

@Module({
  imports: [
    FileActionRequestDomainModule,
    FileActionRequestInfraModule,
    FileDomainModule,
    FolderDomainModule,
    FileBusinessModule,
    UserModule,
  ],
  providers: [
    FileActionRequestCommandService,
    FileActionRequestQueryService,
    FileActionRequestValidationService,
    {
      provide: FILE_ACTION_REQUEST_NOTIFICATION_PORT,
      useClass: NoopNotificationAdapter,
    },
  ],
  exports: [
    FileActionRequestCommandService,
    FileActionRequestQueryService,
  ],
})
export class FileActionRequestModule {}
```

**Step 3: Add to `src/business/business.module.ts`**

Import and export `FileActionRequestModule`.

**Step 4: Commit**

```bash
git add src/business/file-action-request/ src/business/business.module.ts
git commit -m "feat(file-action-request): add query service and business module"
```

---

## Task 8: UserService 확장 — findUsersByPermission

**Files:**
- Modify: `src/business/user/user.service.ts`

**Step 1: Add method to find users by permission code**

`UserService`에 `findUsersByPermission(permission: PermissionEnum)` 메서드 추가.
내부 구현: Role → Permission 관계를 통해 해당 permission code를 가진 Role을 찾고, 그 Role에 속한 활성 User 목록 반환.

**Step 2: Commit**

```bash
git add src/business/user/user.service.ts
git commit -m "feat(user): add findUsersByPermission method for approver lookup"
```

---

## Task 9: Interface Layer — 요청자 컨트롤러 + DTO

**Files:**
- Create: `src/interface/controller/file-action-request/file-action-request.controller.ts`
- Create: `src/interface/controller/file-action-request/file-action-request.swagger.ts`
- Create: `src/interface/controller/file-action-request/dto/create-move-request.dto.ts`
- Create: `src/interface/controller/file-action-request/dto/create-delete-request.dto.ts`
- Create: `src/interface/controller/file-action-request/dto/file-action-request-response.dto.ts`
- Create: `src/interface/controller/file-action-request/dto/file-action-request-query.dto.ts`
- Create: `src/interface/controller/file-action-request/dto/index.ts`
- Modify: `src/interface/interface.module.ts` — controller 등록

**Endpoints:**

```
POST   /v1/file-action-requests/move          @RequirePermissions(FILE_MOVE_REQUEST)
POST   /v1/file-action-requests/delete         @RequirePermissions(FILE_DELETE_REQUEST)
GET    /v1/file-action-requests/my             @RequirePermissions(FILE_MOVE_REQUEST) or FILE_DELETE_REQUEST
GET    /v1/file-action-requests/approvers      (승인자 후보 목록)
GET    /v1/file-action-requests/:id            (상세)
POST   /v1/file-action-requests/:id/cancel     (취소)
```

모든 endpoint에 `@AuditAction` 데코레이터 적용.

**Step 1~3: Create DTOs, Controller, Swagger**

**Step 4: Add to InterfaceModule**

**Step 5: Commit**

```bash
git add src/interface/controller/file-action-request/ src/interface/interface.module.ts
git commit -m "feat(file-action-request): add requester controller with DTOs and swagger"
```

---

## Task 10: Interface Layer — 승인자(Admin) 컨트롤러

**Files:**
- Create: `src/interface/controller/admin/file-action-request/file-action-request-admin.controller.ts`
- Create: `src/interface/controller/admin/file-action-request/file-action-request-admin.swagger.ts`
- Create: `src/interface/controller/admin/file-action-request/dto/approve-request.dto.ts`
- Create: `src/interface/controller/admin/file-action-request/dto/reject-request.dto.ts`
- Create: `src/interface/controller/admin/file-action-request/dto/bulk-request.dto.ts`
- Create: `src/interface/controller/admin/file-action-request/dto/admin-query.dto.ts`
- Create: `src/interface/controller/admin/file-action-request/dto/index.ts`
- Modify: `src/interface/controller/admin/admin.module.ts` — controller 등록

**Endpoints:**

```
GET    /v1/admin/file-action-requests              @RequirePermissions(FILE_MOVE_APPROVE or FILE_DELETE_APPROVE)
GET    /v1/admin/file-action-requests/summary
GET    /v1/admin/file-action-requests/my-pending
GET    /v1/admin/file-action-requests/:id
POST   /v1/admin/file-action-requests/:id/approve   @RequirePermissions(FILE_MOVE_APPROVE)
POST   /v1/admin/file-action-requests/:id/reject     @RequirePermissions(FILE_MOVE_APPROVE)
POST   /v1/admin/file-action-requests/bulk-approve
POST   /v1/admin/file-action-requests/bulk-reject
```

모든 endpoint에 `@AuditAction` 데코레이터 적용.

**Step 1~3: Create DTOs, Controller, Swagger**

**Step 4: Add to AdminModule**

**Step 5: Commit**

```bash
git add src/interface/controller/admin/file-action-request/ src/interface/controller/admin/admin.module.ts
git commit -m "feat(file-action-request): add admin controller for approval workflow"
```

---

## Task 11: 통합 검증

**Step 1: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```
Expected: 에러 없음

**Step 2: 기존 테스트 확인**

```bash
npx jest --no-coverage --passWithNoTests
```
Expected: 기존 테스트 깨지지 않음

**Step 3: 서버 시작 확인**

```bash
npm run start:dev
```
Expected: 정상 시작, Swagger에서 새 endpoint 확인

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(file-action-request): complete file action request/approval workflow"
```

---

## 요약: 생성 파일 목록

| Layer | 파일 | 역할 |
|---|---|---|
| Domain | `enums/file-action-type.enum.ts` | MOVE/DELETE |
| Domain | `enums/file-action-request-status.enum.ts` | 상태 enum |
| Domain | `entities/file-action-request.entity.ts` | 도메인 엔티티 |
| Domain | `entities/file-action-request.entity.spec.ts` | 엔티티 테스트 |
| Domain | `repositories/...repository.interface.ts` | 레포 인터페이스 |
| Domain | `services/...domain.service.ts` | 도메인 서비스 |
| Domain | `ports/notification.port.ts` | 알림 포트 |
| Infra | `entities/file-action-request.orm-entity.ts` | ORM 엔티티 |
| Infra | `mapper/file-action-request.mapper.ts` | ORM↔Domain 변환 |
| Infra | `repositories/file-action-request.repository.ts` | 레포 구현 |
| Infra | `file-action-request-infra.module.ts` | 인프라 모듈 |
| Infra | `notification/noop-notification.adapter.ts` | Noop 알림 |
| Business | `file-action-request-command.service.ts` | 생성/승인/반려/취소 |
| Business | `file-action-request-query.service.ts` | 조회 |
| Business | `file-action-request-validation.service.ts` | 검증 |
| Business | `file-action-request.module.ts` | 비즈니스 모듈 |
| Interface | `file-action-request.controller.ts` | 요청자 컨트롤러 |
| Interface | `file-action-request-admin.controller.ts` | 승인자 컨트롤러 |

수정 파일: `audit-action.enum.ts`, `common.enum.ts`, `error-codes.ts`, `domain.module.ts`, `business.module.ts`, `interface.module.ts`, `admin.module.ts`, `user.service.ts`
