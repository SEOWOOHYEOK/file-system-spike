/**
 * FileStorageObject Repository 구현체
 * TypeORM을 사용한 파일 스토리지 객체 리포지토리
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileStorageObjectOrmEntity } from '../entities/file-storage-object.orm-entity';
import { TransactionOptions, CacheDetailedStats } from '../../../domain/storage/file/repositories/file-storage-object.repository.interface';
import {
  FileStorageObjectEntity,
  StorageType,
  AvailabilityStatus,
} from '../../../domain/storage/file/entity/file-storage-object.entity';
import type { IFileStorageObjectRepository } from '../../../domain/storage/file/repositories/file-storage-object.repository.interface';

@Injectable()
export class FileStorageObjectRepository implements IFileStorageObjectRepository {
  constructor(
    @InjectRepository(FileStorageObjectOrmEntity)
    private readonly repository: Repository<FileStorageObjectOrmEntity>,
  ) { }

  /**
   * 트랜잭션이 있으면 해당 매니저의 리포지토리를, 없으면 기본 리포지토리 반환
   */
  private getRepository(options?: TransactionOptions): Repository<FileStorageObjectOrmEntity> {
    return options?.queryRunner
      ? options.queryRunner.manager.getRepository(FileStorageObjectOrmEntity)
      : this.repository;
  }

  /**
   * ORM Entity -> Domain Entity 변환
   */
  private toDomain(orm: FileStorageObjectOrmEntity): FileStorageObjectEntity {
    return new FileStorageObjectEntity({
      id: orm.id,
      fileId: orm.fileId,
      storageType: orm.storageType as StorageType,
      objectKey: orm.objectKey,
      availabilityStatus: orm.availabilityStatus as AvailabilityStatus,
      lastAccessed: orm.lastAccessed ?? undefined,
      accessCount: orm.accessCount,
      leaseCount: orm.leaseCount,
      checksum: orm.checksum ?? undefined,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt ?? undefined,
    });
  }

  /**
   * Domain Entity -> ORM Entity 변환
   */
  private toOrm(domain: FileStorageObjectEntity): FileStorageObjectOrmEntity {
    const orm = new FileStorageObjectOrmEntity();
    orm.id = domain.id;
    orm.fileId = domain.fileId;
    orm.storageType = domain.storageType;
    orm.objectKey = domain.objectKey;
    orm.availabilityStatus = domain.availabilityStatus;
    orm.lastAccessed = domain.lastAccessed ?? null;
    orm.accessCount = domain.accessCount;
    orm.leaseCount = domain.leaseCount;
    orm.checksum = domain.checksum ?? null;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt ?? new Date();
    return orm;
  }

  async findByFileIdAndType(
    fileId: string,
    storageType: StorageType,
    options?: TransactionOptions,
  ): Promise<FileStorageObjectEntity | null> {
    const repo = this.getRepository(options);
    const orm = await repo.findOne({
      where: { fileId, storageType },
    });
    return orm ? this.toDomain(orm) : null;
  }

  async findByFileIdAndTypeForUpdate(
    fileId: string,
    storageType: StorageType,
    options?: TransactionOptions,
  ): Promise<FileStorageObjectEntity | null> {
    const repo = this.getRepository(options);
    const orm = await repo
      .createQueryBuilder('fso')
      .where('fso.fileId = :fileId', { fileId })
      .andWhere('fso.storageType = :storageType', { storageType })
      .setLock('pessimistic_write')
      .getOne();
    return orm ? this.toDomain(orm) : null;
  }

  async findByFileId(fileId: string, options?: TransactionOptions): Promise<FileStorageObjectEntity[]> {
    const repo = this.getRepository(options);
    const orms = await repo.find({ where: { fileId } });
    return orms.map((orm) => this.toDomain(orm));
  }

  async save(storageObject: FileStorageObjectEntity, options?: TransactionOptions): Promise<FileStorageObjectEntity> {
    const repo = this.getRepository(options);
    const orm = this.toOrm(storageObject);
    const saved = await repo.save(orm);
    return this.toDomain(saved);
  }

  async delete(id: string, options?: TransactionOptions): Promise<void> {
    const repo = this.getRepository(options);
    await repo.delete(id);
  }

  async deleteByFileId(fileId: string, options?: TransactionOptions): Promise<void> {
    const repo = this.getRepository(options);
    await repo.delete({ fileId });
  }

  async updateStatusByFileIds(
    fileIds: string[],
    storageType: StorageType,
    status: string,
    options?: TransactionOptions,
  ): Promise<number> {
    const repo = this.getRepository(options);
    const result = await repo
      .createQueryBuilder()
      .update(FileStorageObjectOrmEntity)
      .set({ availabilityStatus: status, updatedAt: new Date() })
      .where('fileId IN (:...fileIds)', { fileIds })
      .andWhere('storageType = :storageType', { storageType })
      .execute();
    return result.affected || 0;
  }

  /**
   * 스토리지 타입별로 페이징 조회 (일관성 검증용)
   */
  async findByStorageType(
    storageType: StorageType,
    limit: number,
    offset: number,
    options?: TransactionOptions,
  ): Promise<FileStorageObjectEntity[]> {
    const repo = this.getRepository(options);
    const orms = await repo.find({
      where: { storageType },
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
    return orms.map((orm) => this.toDomain(orm));
  }

  /**
   * 샘플링 조회 - 랜덤 샘플 (일관성 검증용)
   */
  async findRandomSamples(
    storageType: StorageType,
    count: number,
    options?: TransactionOptions,
  ): Promise<FileStorageObjectEntity[]> {
    const repo = this.getRepository(options);
    const total = await repo.count({ where: { storageType } });

    if (total === 0) {
      return [];
    }

    // 랜덤 오프셋 생성
    const randomOffsets: number[] = [];
    for (let i = 0; i < count && i < total; i++) {
      randomOffsets.push(Math.floor(Math.random() * total));
    }

    const uniqueOffsets = [...new Set(randomOffsets)];
    const results: FileStorageObjectEntity[] = [];

    for (const offset of uniqueOffsets) {
      const orms = await repo.find({
        where: { storageType },
        take: 1,
        skip: offset,
      });
      if (orms.length > 0) {
        results.push(this.toDomain(orms[0]));
      }
    }

    return results;
  }

  /**
   * 스토리지 타입별 전체 개수 조회
   */
  async countByStorageType(
    storageType: StorageType,
    options?: TransactionOptions,
  ): Promise<number> {
    const repo = this.getRepository(options);
    return repo.count({ where: { storageType } });
  }

  /**
   * Eviction 대상 조회 (LRU 기준)
   * 조건: CACHE 타입, AVAILABLE 상태, leaseCount=0, NAS에 동기화 완료된 파일
   */
  async findEvictionCandidatesLRU(
    limit: number,
    options?: TransactionOptions,
  ): Promise<FileStorageObjectEntity[]> {
    const repo = this.getRepository(options);

    // 서브쿼리: NAS에 AVAILABLE 상태로 존재하는 파일 ID 목록
    const subQuery = repo
      .createQueryBuilder('nas')
      .select('nas.fileId')
      .where('nas.storageType = :nasType', { nasType: StorageType.NAS })
      .andWhere('nas.availabilityStatus = :availableStatus', {
        availableStatus: AvailabilityStatus.AVAILABLE,
      });

    // 메인 쿼리: CACHE에서 Eviction 가능한 파일 조회 (LRU)
    const orms = await repo
      .createQueryBuilder('cache')
      .where('cache.storageType = :cacheType', { cacheType: StorageType.CACHE })
      .andWhere('cache.availabilityStatus = :availableStatus', {
        availableStatus: AvailabilityStatus.AVAILABLE,
      })
      .andWhere('cache.leaseCount = 0')
      .andWhere(`cache.fileId IN (${subQuery.getQuery()})`)
      .setParameters(subQuery.getParameters())
      .orderBy('cache.lastAccessed', 'ASC', 'NULLS FIRST')
      .take(limit)
      .getMany();


    //   SELECT "cache"."id" AS "cache_id",
    //  "cache"."fileId" AS "cache_fileId",
    //  "cache"."storageType" AS "cache_storageType",
    //  "cache"."objectKey" AS "cache_objectKey",
    //  "cache"."availabilityStatus" AS "cache_availabilityStatus",
    //  "cache"."lastAccessed" AS "cache_lastAccessed",
    //  "cache"."accessCount" AS "cache_accessCount",
    //  "cache"."leaseCount" AS "cache_leaseCount",
    //  "cache"."createdAt" AS "cache_createdAt",
    //  "cache"."updatedAt" AS "cache_updatedAt" 
    //  FROM "file_storage_objects" "cache"
    //   WHERE "cache"."storageType" = $1 
    //   AND "cache"."availabilityStatus" = $2 
    //   AND "cache"."leaseCount" = 0 
    //   AND "cache"."fileId" IN 
    //   (SELECT "nas"."fileId" AS "nas_fileId" 
    //   FROM "file_storage_objects" "nas" 
    //   WHERE "nas"."storageType" = $3 
    //   AND "nas"."availabilityStatus" = $2) ORDER BY "cache"."lastAccessed"

    //   ASC NULLS FIRST LIMIT 100 -- PARAMETERS: ["CACHE","AVAILABLE","NAS"]

    return orms.map((orm) => this.toDomain(orm));
  }

  /**
   * Atomic 상태 전환 (AVAILABLE -> EVICTING)
   * Race Condition 방지를 위해 leaseCount=0 조건 포함
   * @returns 영향받은 row 수 (0: 실패, 1: 성공)
   */
  async tryMarkEvicting(
    fileId: string,
    options?: TransactionOptions,
  ): Promise<number> {
    const repo = this.getRepository(options);

    const result = await repo
      .createQueryBuilder()
      .update(FileStorageObjectOrmEntity)
      .set({
        availabilityStatus: AvailabilityStatus.EVICTING,
        updatedAt: new Date(),
      })
      .where('fileId = :fileId', { fileId })
      .andWhere('storageType = :storageType', { storageType: StorageType.CACHE })
      .andWhere('availabilityStatus = :status', { status: AvailabilityStatus.AVAILABLE })
      .andWhere('leaseCount = 0')
      .execute();

    return result.affected || 0;
  }

  /**
   * Eviction 완료 후 캐시 레코드 삭제
   */
  async deleteCacheRecord(
    fileId: string,
    options?: TransactionOptions,
  ): Promise<void> {
    const repo = this.getRepository(options);
    await repo.delete({
      fileId,
      storageType: StorageType.CACHE,
    });
  }

  /**
   * 캐시 상세 통계 조회
   */
  async getCacheDetailedStats(
    options?: TransactionOptions,
  ): Promise<CacheDetailedStats> {
    const repo = this.getRepository(options);

    // 1. 상태별 파일 수 (단일 쿼리)
    const statusCounts: { status: string; count: string }[] = await repo
      .createQueryBuilder('c')
      .select('c.availabilityStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('c.storageType = :type', { type: StorageType.CACHE })
      .groupBy('c.availabilityStatus')
      .getRawMany();

    const byStatus: Record<string, number> = {};
    let totalCount = 0;
    for (const row of statusCounts) {
      const cnt = parseInt(row.count, 10);
      byStatus[row.status] = cnt;
      totalCount += cnt;
    }

    // 2. lease 중인 파일 수
    const leasedCount = await repo
      .createQueryBuilder('c')
      .where('c.storageType = :type', { type: StorageType.CACHE })
      .andWhere('c.leaseCount > 0')
      .getCount();

    // 3. NAS 미동기화 파일 수 (NAS 객체가 없거나 NAS가 AVAILABLE이 아닌 캐시 파일)
    const nasAvailableSubQuery = repo
      .createQueryBuilder('nas')
      .select('nas.fileId')
      .where('nas.storageType = :nasType', { nasType: StorageType.NAS })
      .andWhere('nas.availabilityStatus = :nasAvailable', {
        nasAvailable: AvailabilityStatus.AVAILABLE,
      });

    const unsyncedToNasCount = await repo
      .createQueryBuilder('c')
      .where('c.storageType = :type', { type: StorageType.CACHE })
      .andWhere(`c.fileId NOT IN (${nasAvailableSubQuery.getQuery()})`)
      .setParameters(nasAvailableSubQuery.getParameters())
      .getCount();

    // 4. Eviction 가능한 파일 수
    const evictableCount = await repo
      .createQueryBuilder('c')
      .where('c.storageType = :type', { type: StorageType.CACHE })
      .andWhere('c.availabilityStatus = :available', {
        available: AvailabilityStatus.AVAILABLE,
      })
      .andWhere('c.leaseCount = 0')
      .andWhere(`c.fileId IN (${nasAvailableSubQuery.getQuery()})`)
      .setParameters(nasAvailableSubQuery.getParameters())
      .getCount();

    return {
      totalCount,
      byStatus,
      leasedCount,
      unsyncedToNasCount,
      evictableCount,
    };
  }
}
