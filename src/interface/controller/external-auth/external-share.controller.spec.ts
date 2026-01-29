/**
 * ============================================================
 * 📦 ExternalShareController 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - ExternalShareController 클래스
 *
 * 📋 비즈니스 맥락:
 *   - 외부 사용자의 공유 파일 접근
 *   - 일회성 토큰 기반 콘텐츠 접근
 *   - ExternalShareAccessService를 통한 실제 파일 스트리밍
 *
 * ⚠️ 중요 고려사항:
 *   - VIEW 액션: inline 헤더로 콘텐츠 표시 (뷰어용)
 *   - DOWNLOAD 액션: attachment 헤더로 다운로드
 *   - 스트림 종료 시 lease 해제 필수
 *   - 비즈니스 로직(파일 다운로드)은 서비스 레이어에서 처리
 * ============================================================
 */
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { Readable } from 'stream';
import { ExternalShareController } from './external-share.controller';
import { ExternalShareAccessService } from '../../../business/external-share/external-share-access.service';
import { PublicShare } from '../../../domain/external-share/entities/public-share.entity';
import { FileEntity } from '../../../domain/file';
import { ExternalJwtAuthGuard } from '../../../common/guards';

describe('ExternalShareController', () => {
  let controller: ExternalShareController;
  let mockAccessService: jest.Mocked<ExternalShareAccessService>;

  /**
   * 🎭 Mock 설정
   * 📍 mockAccessService:
   *   - 실제 동작: 외부 공유 접근 검증 + 파일 다운로드 통합 처리
   *   - Mock 이유: DB, Redis, 파일 시스템 연결 없이 컨트롤러 로직 테스트
   *   - 파일 스트리밍: accessContent가 검증 후 file, stream까지 반환
   */
  beforeEach(async () => {
    mockAccessService = {
      getMyShares: jest.fn(),
      getShareDetail: jest.fn(),
      accessContent: jest.fn(),
      releaseLease: jest.fn(),
    } as unknown as jest.Mocked<ExternalShareAccessService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExternalShareController],
      providers: [
        {
          provide: ExternalShareAccessService,
          useValue: mockAccessService,
        },
      ],
    })
      .overrideGuard(ExternalJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ExternalShareController>(ExternalShareController);
  });

  describe('GET /v1/ext/shares', () => {
    it('should return shares for external user', async () => {
      const user = { id: 'ext-user-123' };
      const paginatedResult = {
        items: [
          new PublicShare({
            id: 'share-1',
            fileId: 'file-1',
            ownerId: 'owner',
            externalUserId: 'ext-user-123',
          }),
        ],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      };
      mockAccessService.getMyShares.mockResolvedValue(paginatedResult);

      const result = await controller.getMyShares(user, 1, 20);

      expect(result.items).toHaveLength(1);
    });
  });

  describe('GET /v1/ext/shares/:shareId', () => {
    it('should return share detail with content token', async () => {
      const user = { id: 'ext-user-123' };
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
      });
      mockAccessService.getShareDetail.mockResolvedValue({
        share,
        contentToken: 'token-abc',
      });

      const result = await controller.getShareDetail(user, 'share-123');

      expect(result.share.id).toBe('share-123');
      expect(result.contentToken).toBe('token-abc');
    });
  });

  describe('GET /v1/ext/shares/:shareId/content', () => {
    /**
     * 📌 테스트 시나리오: 정상적인 파일 콘텐츠 스트리밍 (뷰어용)
     *
     * 🎯 검증 목적:
     *   외부 사용자가 공유된 파일을 뷰어에서 볼 때,
     *   ExternalShareAccessService.accessContent가 검증 및 파일 다운로드를 통합 처리하여
     *   실제 파일 스트림이 inline 형식으로 전달되는지 확인
     *
     * ✅ 기대 결과:
     *   - Content-Type이 파일의 mimeType으로 설정됨
     *   - Content-Disposition이 inline으로 설정됨 (뷰어 표시용)
     *   - 파일 스트림이 응답에 파이프됨
     *   - 스트림 종료 시 lease가 해제됨
     */
    it('should stream file content with inline disposition for VIEW action', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const user = { id: 'ext-user-123' };
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
      });

      // FileEntity Mock 생성
      const mockFile = {
        id: 'file-456',
        name: '테스트문서.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      } as FileEntity;

      // Readable 스트림 Mock 생성
      const mockStream = new Readable({
        read() {
          this.push('file content');
          this.push(null);
        },
      });

      // accessContent가 검증 + 파일 정보 + 스트림을 함께 반환
      mockAccessService.accessContent.mockResolvedValue({
        success: true,
        share,
        file: mockFile,
        stream: mockStream,
      });

      // Response Mock - pipe 동작 시뮬레이션
      const mockRes = {
        set: jest.fn(),
        on: jest.fn(),
      } as unknown as Response;

      // mockStream.pipe 호출 시 end 이벤트 발생 시뮬레이션
      mockStream.pipe = jest.fn().mockImplementation((res) => {
        // pipe 후 'end' 이벤트 리스너에 등록된 콜백 실행
        process.nextTick(() => {
          mockStream.emit('end');
        });
        return res;
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await controller.getContent(
        user,
        'share-123',
        'token-abc',
        'Mozilla/5.0',
        '192.168.1.100',
        mockRes,
      );

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      // 1. accessContent가 VIEW 액션으로 호출됨
      expect(mockAccessService.accessContent).toHaveBeenCalledWith(
        expect.objectContaining({
          externalUserId: 'ext-user-123',
          shareId: 'share-123',
          token: 'token-abc',
          action: 'VIEW',
        }),
      );

      // 2. 응답 헤더가 올바르게 설정됨 (inline - 뷰어용)
      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/pdf',
          'Content-Disposition': expect.stringContaining('inline'),
        }),
      );

      // 3. 스트림이 응답에 파이프됨
      expect(mockStream.pipe).toHaveBeenCalledWith(mockRes);
    });

    /**
     * 📌 테스트 시나리오: 스트림 에러 시 lease 해제
     *
     * 🎯 검증 목적:
     *   파일 스트리밍 중 에러가 발생해도 lease가 정상적으로 해제되는지 확인
     *   (리소스 누수 방지)
     *
     * ✅ 기대 결과:
     *   - 스트림 에러 발생 시 releaseLease가 호출됨
     */
    it('should release lease when stream errors', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const user = { id: 'ext-user-123' };
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
      });

      const mockFile = {
        id: 'file-456',
        name: '테스트문서.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      } as FileEntity;

      const mockStream = new Readable({
        read() {},
      });

      mockAccessService.accessContent.mockResolvedValue({
        success: true,
        share,
        file: mockFile,
        stream: mockStream,
      });

      const mockRes = {
        set: jest.fn(),
        on: jest.fn(),
      } as unknown as Response;

      // 스트림 에러 시뮬레이션
      mockStream.pipe = jest.fn().mockImplementation((res) => {
        process.nextTick(() => {
          mockStream.emit('error', new Error('Stream error'));
        });
        return res;
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await controller.getContent(
        user,
        'share-123',
        'token-abc',
        'Mozilla/5.0',
        '192.168.1.100',
        mockRes,
      );

      // 이벤트 루프에서 에러 핸들러가 실행될 때까지 대기
      await new Promise((resolve) => setImmediate(resolve));

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockAccessService.releaseLease).toHaveBeenCalledWith('file-456');
    });

    /**
     * 📌 테스트 시나리오: 스트림이 없는 경우 빈 응답 처리
     *
     * 🎯 검증 목적:
     *   스트림 없이 반환하는 경우
     *   (예: 파일 메타데이터만 있는 경우) 적절히 처리되는지 확인
     *
     * ✅ 기대 결과:
     *   - res.end()가 호출되어 응답 종료
     */
    it('should handle null stream gracefully', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const user = { id: 'ext-user-123' };
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
      });

      const mockFile = {
        id: 'file-456',
        name: '테스트문서.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      } as FileEntity;

      // 스트림이 null인 경우
      mockAccessService.accessContent.mockResolvedValue({
        success: true,
        share,
        file: mockFile,
        stream: null,
      });

      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      } as unknown as Response;

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await controller.getContent(
        user,
        'share-123',
        'token-abc',
        'Mozilla/5.0',
        '192.168.1.100',
        mockRes,
      );

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockRes.end).toHaveBeenCalled();
    });
  });

  describe('GET /v1/ext/shares/:shareId/download', () => {
    /**
     * 📌 테스트 시나리오: 정상적인 파일 다운로드
     *
     * 🎯 검증 목적:
     *   외부 사용자가 공유된 파일을 다운로드할 때,
     *   ExternalShareAccessService.accessContent가 검증 및 파일 다운로드를 통합 처리하여
     *   실제 파일 스트림이 attachment 형식으로 전달되는지 확인
     *
     * ✅ 기대 결과:
     *   - Content-Type이 파일의 mimeType으로 설정됨
     *   - Content-Disposition이 attachment로 설정됨 (다운로드용)
     *   - Content-Length가 파일 크기로 설정됨
     *   - 파일 스트림이 응답에 파이프됨
     *   - 스트림 종료 시 lease가 해제됨
     */
    it('should stream file with attachment disposition for DOWNLOAD action', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const user = { id: 'ext-user-123' };
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
      });

      const mockFile = {
        id: 'file-456',
        name: '테스트문서.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      } as FileEntity;

      const mockStream = new Readable({
        read() {
          this.push('file content for download');
          this.push(null);
        },
      });

      // accessContent가 검증 + 파일 정보 + 스트림을 함께 반환
      mockAccessService.accessContent.mockResolvedValue({
        success: true,
        share,
        file: mockFile,
        stream: mockStream,
      });

      const mockRes = {
        set: jest.fn(),
        on: jest.fn(),
      } as unknown as Response;

      mockStream.pipe = jest.fn().mockImplementation((res) => {
        process.nextTick(() => {
          mockStream.emit('end');
        });
        return res;
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await controller.downloadFile(
        user,
        'share-123',
        'token-abc',
        'Mozilla/5.0',
        '192.168.1.100',
        mockRes,
      );

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      // 1. accessContent가 DOWNLOAD 액션으로 호출됨
      expect(mockAccessService.accessContent).toHaveBeenCalledWith(
        expect.objectContaining({
          externalUserId: 'ext-user-123',
          shareId: 'share-123',
          token: 'token-abc',
          action: 'DOWNLOAD',
        }),
      );

      // 2. 응답 헤더가 올바르게 설정됨 (attachment - 다운로드용)
      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/pdf',
          'Content-Disposition': expect.stringContaining('attachment'),
          'Content-Length': 2048,
        }),
      );

      // 3. 파일명이 UTF-8 인코딩됨
      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Disposition': expect.stringContaining(
            encodeURIComponent('테스트문서.pdf'),
          ),
        }),
      );

      // 4. 스트림이 응답에 파이프됨
      expect(mockStream.pipe).toHaveBeenCalledWith(mockRes);
    });

    /**
     * 📌 테스트 시나리오: 스트림 close 이벤트 시 lease 해제
     *
     * 🎯 검증 목적:
     *   클라이언트가 다운로드 중 연결을 끊어도 lease가 정상적으로 해제되는지 확인
     *   (리소스 누수 방지)
     *
     * ✅ 기대 결과:
     *   - 스트림 close 이벤트 발생 시 releaseLease가 호출됨
     */
    it('should release lease when stream closes', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const user = { id: 'ext-user-123' };
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
      });

      const mockFile = {
        id: 'file-456',
        name: '테스트문서.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      } as FileEntity;

      const mockStream = new Readable({
        read() {},
      });

      mockAccessService.accessContent.mockResolvedValue({
        success: true,
        share,
        file: mockFile,
        stream: mockStream,
      });

      const mockRes = {
        set: jest.fn(),
        on: jest.fn(),
      } as unknown as Response;

      // 스트림 close 이벤트 시뮬레이션
      mockStream.pipe = jest.fn().mockImplementation((res) => {
        process.nextTick(() => {
          mockStream.emit('close');
        });
        return res;
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await controller.downloadFile(
        user,
        'share-123',
        'token-abc',
        'Mozilla/5.0',
        '192.168.1.100',
        mockRes,
      );

      // 이벤트 루프에서 close 핸들러가 실행될 때까지 대기
      await new Promise((resolve) => setImmediate(resolve));

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockAccessService.releaseLease).toHaveBeenCalledWith('file-456');
    });

    /**
     * 📌 테스트 시나리오: 한글 파일명 다운로드 시 올바른 인코딩
     *
     * 🎯 검증 목적:
     *   한글 파일명이 RFC 5987에 따라 UTF-8로 올바르게 인코딩되는지 확인
     *   (브라우저 호환성)
     *
     * ✅ 기대 결과:
     *   - filename*=UTF-8'' 형식으로 인코딩됨
     */
    it('should properly encode Korean filename in Content-Disposition', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const user = { id: 'ext-user-123' };
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
      });

      const koreanFileName = '한글_파일명_테스트.xlsx';
      const mockFile = {
        id: 'file-456',
        name: koreanFileName,
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: 4096,
      } as FileEntity;

      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });

      mockAccessService.accessContent.mockResolvedValue({
        success: true,
        share,
        file: mockFile,
        stream: mockStream,
      });

      const mockRes = {
        set: jest.fn(),
        on: jest.fn(),
      } as unknown as Response;

      mockStream.pipe = jest.fn().mockReturnValue(mockRes);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await controller.downloadFile(
        user,
        'share-123',
        'token-abc',
        'Mozilla/5.0',
        '192.168.1.100',
        mockRes,
      );

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      const setCall = mockRes.set.mock.calls[0][0];
      expect(setCall['Content-Disposition']).toContain(
        `filename*=UTF-8''${encodeURIComponent(koreanFileName)}`,
      );
    });
  });
});
