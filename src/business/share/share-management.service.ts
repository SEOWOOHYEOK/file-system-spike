import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  FILE_SHARE_REPOSITORY,

} from '../../domain/share/repositories/file-share.repository.interface';
import {
  FILE_REPOSITORY,
} from '../../domain/file/repositories/file.repository.interface';
import { FileShare } from '../../domain/share/entities/file-share.entity';
import { CreateShareDto } from './dto/create-share.dto';
import type { IFileShareRepository } from '../../domain/share/repositories/file-share.repository.interface';
import type { IFileRepository } from '../../domain/file/repositories/file.repository.interface';


/**
 * Share Management 서비스
 *
 * 파일 소유자(Owner)의 공유 생성/관리 담당
 */
@Injectable()
export class ShareManagementService {
  constructor(
    @Inject(FILE_SHARE_REPOSITORY)
    private readonly shareRepo: IFileShareRepository,
    @Inject(FILE_REPOSITORY)
    private readonly fileRepo: IFileRepository,
  ) { }

  /**
   * 공유 생성
   *
   * @param ownerId 파일 소유자 ID (요청자)
   * @param dto 공유 생성 정보
   * @throws NotFoundException 파일이 존재하지 않는 경우
   * @throws ForbiddenException 파일 소유자가 아닌 경우
   * @throws ConflictException 이미 같은 수신자에게 공유된 경우
   */
  async createShare(ownerId: string, dto: CreateShareDto): Promise<FileShare> {
    // 1. 파일 존재 및 소유권 검증
    const file = await this.fileRepo.findById(dto.fileId);
    if (!file) {
      throw new NotFoundException(`File with ID ${dto.fileId} not found`);
    }


    // 2. 중복 공유 확인
    const existingShare = await this.shareRepo.findByFileAndRecipient(
      dto.fileId,
      dto.recipientId,
    );
    if (existingShare) {
      throw new ConflictException(
        'File is already shared with this recipient',
      );
    }

    // 3. FileShare 도메인 엔티티 생성
    const share = new FileShare({
      id: uuidv4(),
      fileId: dto.fileId,
      ownerId,
      recipientId: dto.recipientId,
      permissions: dto.permissions,
      maxDownloadCount: dto.maxDownloadCount,
      currentDownloadCount: 0,
      expiresAt: dto.expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 4. 저장
    return this.shareRepo.save(share);
  }

  /**
   * 공유 취소 (revoke)
   *
   * @param ownerId 요청자 ID
   * @param shareId 취소할 공유 ID
   * @throws NotFoundException 공유가 존재하지 않는 경우
   * @throws ForbiddenException 공유 소유자가 아닌 경우
   */
  async revokeShare(ownerId: string, shareId: string): Promise<void> {
    const share = await this.shareRepo.findById(shareId);
    if (!share) {
      throw new NotFoundException(`Share with ID ${shareId} not found`);
    }

    if (share.ownerId !== ownerId) {
      throw new ForbiddenException('Only share owner can revoke share');
    }

    await this.shareRepo.delete(shareId);
  }

  /**
   * 내가 공유한 파일 목록 조회
   */
  async getMySharedFiles(ownerId: string): Promise<FileShare[]> {
    return this.shareRepo.findByOwner(ownerId);
  }
}
