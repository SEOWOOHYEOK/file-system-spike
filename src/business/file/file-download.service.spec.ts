/**
 * ============================================================
 * 📦 파일 다운로드 서비스 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - FileDownloadService.download
 *
 * 📋 비즈니스 맥락:
 *   - 휴지통 파일 다운로드 차단
 *   - 캐시/ NAS 모두 없을 때의 오류 응답 규약 준수
 *
 * ⚠️ 중요 고려사항:
 *   - 문서에 명시된 에러 코드와 실제 구현의 일치 여부
 * ============================================================
 */

import { FileDownloadService } from './file-download.service';
import { FileEntity } from '../../domain/file';
import { FileState } from '../../domain/file/type/file.type';

describe('FileDownloadService', () => {
  /**
   * 🎭 Mock 설정
   * 📍 Domain Services Mock:
   *   - Mock 이유: DB 없이 파일 상태 분기 로직만 검증
   */
  const mockFileDomainService = {
    조회: jest.fn(),
    잠금조회: jest.fn(),
  };
  const mockFolderDomainService = {
    조회: jest.fn(),
  };
  const mockFileCacheStorageDomainService = {
    조회: jest.fn(),
    저장: jest.fn(),
  };
  const mockFileNasStorageDomainService = {
    조회: jest.fn(),
    저장: jest.fn(),
  };
  const mockCacheStorage = {
    파일스트림읽기: jest.fn(),
  };
  const mockNasStorage = {
    파일스트림읽기: jest.fn(),
  };
  const mockJobQueue = {
    addJob: jest.fn(),
  };

  let service: FileDownloadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FileDownloadService(
      mockFileDomainService as any,
      mockFolderDomainService as any,
      mockFileCacheStorageDomainService as any,
      mockFileNasStorageDomainService as any,
      mockCacheStorage as any,
      mockNasStorage as any,
      mockJobQueue as any,
    );
  });

  /**
   * 📌 테스트 시나리오: 휴지통(TRASHED) 상태의 파일 다운로드 요청
   *
   * 🎯 검증 목적:
   *   - 문서 요구사항: TRASHED 상태면 400 FILE_IN_TRASH 응답
   *
   * ✅ 기대 결과:
   *   - BadRequestException 발생, code=FILE_IN_TRASH
   */
  it('휴지통 파일 다운로드 시 FILE_IN_TRASH 에러를 반환해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const file = new FileEntity({
      id: 'file-1',
      name: '111.txt',
      folderId: 'folder-1',
      sizeBytes: 10,
      mimeType: 'text/plain',
      state: FileState.TRASHED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockFileDomainService.조회.mockResolvedValue(file);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
    // ═══════════════════════════════════════════════════════
    await expect(service.download('file-1')).rejects.toMatchObject({
      response: { code: 'FILE_IN_TRASH' },
    });
  });

  /**
   * 📌 테스트 시나리오: 캐시도 없고 NAS도 없는 경우
   *
   * 🎯 검증 목적:
   *   - 문서 요구사항: FILE_NOT_FOUND_IN_STORAGE(500) 반환
   *
   * ✅ 기대 결과:
   *   - InternalServerErrorException 발생, code=FILE_NOT_FOUND_IN_STORAGE
   */
  it('캐시와 NAS 모두 없을 때 FILE_NOT_FOUND_IN_STORAGE 에러를 반환해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const file = new FileEntity({
      id: 'file-2',
      name: '222.txt',
      folderId: 'folder-1',
      sizeBytes: 10,
      mimeType: 'text/plain',
      state: FileState.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockFileDomainService.조회.mockResolvedValue(file);
    mockFileNasStorageDomainService.조회.mockResolvedValue(null);
    mockFileCacheStorageDomainService.조회.mockResolvedValue(null);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
    // ═══════════════════════════════════════════════════════
    await expect(service.download('file-2')).rejects.toMatchObject({
      response: { code: 'FILE_NOT_FOUND_IN_STORAGE' },
    });
  });
});
