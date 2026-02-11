import { Module } from '@nestjs/common';
import { FileActionRequestDomainService } from './services/file-action-request-domain.service';
import { FileActionRequestInfraModule } from '../../infra/database/file-action-request-infra.module';

@Module({
  imports: [FileActionRequestInfraModule],
  providers: [FileActionRequestDomainService],
  exports: [FileActionRequestDomainService],
})
export class FileActionRequestDomainModule {}
