import { Module } from '@nestjs/common';
import { FolderDomainService } from './service/folder-domain.service';

/**
 * 폴더 도메인 모듈
 * 폴더 엔티티, DTO, 도메인 서비스를 제공합니다.
 */
@Module({
  providers: [FolderDomainService],
  exports: [FolderDomainService],
})
export class FolderDomainModule {}
