/**
 * ============================================================
 * 📦 동기화 이벤트 조회 서비스 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - SyncEventQueryService.getSyncEventStatus (이벤트 상태 조회)
 *   - SyncEventQueryService.getFileSyncStatus (파일 동기화 상태 조회)
 *
 * 📋 비즈니스 맥락:
 *   - 동기화 상태 조회는 다중 도메인(파일/스토리지/동기화 이벤트)을 조합한다
 *   - 컨트롤러는 서비스만 의존해야 한다 (DDD 레이어 분리)
 *
 * ⚠️ 중요 고려사항:
 *   - 진행률 계산 규칙(PENDING 0, PROCESSING 50, DONE 100, FAILED 0)
 *   - 스토리지 상태 매핑(캐시/ NAS)
 * ============================================================
 */

import { NotFoundException } from '@nestjs/common';
import { SyncEventQueryService } from './sync-event-query.service';
import {
  SyncEventEntity,
  SyncEventStatus,
  SyncEventTargetType,
  SyncEventType,
} from '../../domain/sync-event';
import { FileEntity, StorageType } from '../../domain/file';
import { FileState } from '../../domain/file/type/file.type';
import { AvailabilityStatus, FileStorageObjectEntity } from '../../domain/storage/file/file-storage-object.entity';

describe('SyncEventQueryService', () => {
  /**
   * 🎭 Mock 설정
   * 📍 mockSyncEventRepository.findById:
   *   - 실제 동작: 이벤트 ID로 동기화 이벤트 조회
   *   - Mock 이유: 존재/부재에 따른 분기만 검증하기 위함
   */
  const mockSyncEventDomainService = {
    조회: jest.fn(),
    파일별조회: jest.fn(),
  };
  const mockFileDomainService = {
    조회: jest.fn(),
  };
  const mockFileCacheStorageDomainService = {
    조회: jest.fn(),
  };
  const mockFileNasStorageDomainService = {
    조회: jest.fn(),
  };

  let service: SyncEventQueryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SyncEventQueryService(
      mockSyncEventDomainService as any,
      mockFileDomainService as any,
      mockFileCacheStorageDomainService as any,
      mockFileNasStorageDomainService as any,
    );
  });

  /**
   * 📌 테스트 시나리오: 동기화 이벤트 ID가 존재하지 않는 경우
   *
   * 🎯 검증 목적:
   *   - 잘못된 이벤트 ID는 즉시 404로 응답해야 한다
   *
   * ✅ 기대 결과:
   *   - NotFoundException 발생
   */
  it('동기화 이벤트가 없으면 SYNC_EVENT_NOT_FOUND를 반환해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    mockSyncEventDomainService.조회.mockResolvedValue(null);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const action = service.getSyncEventStatus('sync-event-1');

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    await expect(action).rejects.toThrow(NotFoundException);
  });

  /**
   * 📌 테스트 시나리오: PROCESSING 상태 이벤트 조회
   *
   * 🎯 검증 목적:
   *   - 진행률 규칙에 따라 50%가 반환되어야 한다
   *
   * ✅ 기대 결과:
   *   - progress = 50
   */
  it('PROCESSING 상태 이벤트는 progress 50을 반환해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const createdAt = new Date('2025-01-01T00:00:00Z');
    const processedAt = new Date('2025-01-01T00:10:00Z');
    const syncEvent = new SyncEventEntity({
      id: 'sync-event-1',
      eventType: SyncEventType.CREATE,
      targetType: SyncEventTargetType.FILE,
      status: SyncEventStatus.PROCESSING,
      retryCount: 1,
      createdAt,
      processedAt,
    });
    mockSyncEventDomainService.조회.mockResolvedValue(syncEvent);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.getSyncEventStatus('sync-event-1');

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result).toEqual({
      id: 'sync-event-1',
      eventType: SyncEventType.CREATE,
      targetType: SyncEventTargetType.FILE,
      status: SyncEventStatus.PROCESSING,
      progress: 50,
      retryCount: 1,
      errorMessage: undefined,
      createdAt: createdAt.toISOString(),
      processedAt: processedAt.toISOString(),
    });
  });

  /**
   * 📌 테스트 시나리오: 파일 동기화 상태 조회 - 정상 케이스
   *
   * 🎯 검증 목적:
   *   - 캐시/ NAS 상태 매핑과 활성 이벤트 정보가 정확해야 한다
   *
   * ✅ 기대 결과:
   *   - cache: AVAILABLE, nas: ERROR
   *   - activeSyncEvent.progress = 50
   */
  it('파일 동기화 상태 조회 시 스토리지 상태와 활성 이벤트를 반환해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const file = new FileEntity({
      id: 'file-1',
      name: 'test.txt',
      folderId: 'folder-1',
      sizeBytes: 10,
      mimeType: 'text/plain',
      state: FileState.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const cacheObject = new FileStorageObjectEntity({
      id: 'cache-1',
      fileId: 'file-1',
      storageType: StorageType.CACHE,
      objectKey: 'cache-key',
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      createdAt: new Date(),
    });
    const nasObject = new FileStorageObjectEntity({
      id: 'nas-1',
      fileId: 'file-1',
      storageType: StorageType.NAS,
      objectKey: 'nas-key',
      availabilityStatus: AvailabilityStatus.ERROR,
      createdAt: new Date(),
    });
    const activeEvent = new SyncEventEntity({
      id: 'sync-event-2',
      eventType: SyncEventType.CREATE,
      targetType: SyncEventTargetType.FILE,
      status: SyncEventStatus.PROCESSING,
      createdAt: new Date('2025-01-02T00:00:00Z'),
    });

    mockFileDomainService.조회.mockResolvedValue(file);
    mockFileCacheStorageDomainService.조회.mockResolvedValue(cacheObject);
    mockFileNasStorageDomainService.조회.mockResolvedValue(nasObject);
    mockSyncEventDomainService.파일별조회.mockResolvedValue([activeEvent]);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.getFileSyncStatus('file-1');

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result).toEqual({
      fileId: 'file-1',
      storageStatus: {
        cache: 'AVAILABLE',
        nas: 'ERROR',
      },
      activeSyncEvent: {
        id: 'sync-event-2',
        eventType: SyncEventType.CREATE,
        status: SyncEventStatus.PROCESSING,
        progress: 50,
        createdAt: activeEvent.createdAt.toISOString(),
      },
    });
  });

  /**
   * 📌 테스트 시나리오: 파일 ID가 존재하지 않는 경우
   *
   * 🎯 검증 목적:
   *   - 파일이 없으면 즉시 404를 반환해야 한다
   *
   * ✅ 기대 결과:
   *   - NotFoundException 발생
   */
  it('파일이 없으면 FILE_NOT_FOUND를 반환해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    mockFileDomainService.조회.mockResolvedValue(null);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const action = service.getFileSyncStatus('file-404');

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    await expect(action).rejects.toThrow(NotFoundException);
  });
});
