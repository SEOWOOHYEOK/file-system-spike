/**
 * 스토리지 인프라 모듈
 * 환경 설정에 따라 적절한 스토리지 어댑터를 주입합니다.
 *
 * 환경변수:
 * - CACHE_STORAGE_TYPE: 'local' | 'seaweedfs' (기본값: 'local')
 * - CACHE_LOCAL_PATH: 로컬 캐시 경로 (기본값: '/data/cache')
 * - SEAWEEDFS_MASTER_URL: SeaweedFS 마스터 URL (기본값: 'http://localhost:9333')
 * - SEAWEEDFS_FILER_URL: SeaweedFS Filer URL (기본값: 'http://localhost:8888')
 * - NAS_MOUNT_PATH: NAS 마운트 경로 (기본값: '/mnt/nas')
 */

import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CACHE_STORAGE_PORT } from '../../domain/storage/ports/cache-storage.port';
import { NAS_STORAGE_PORT } from '../../domain/storage/ports/nas-storage.port';
import { LocalCacheAdapter } from './cache/local/local-cache.adapter';
import { SeaweedFSCacheAdapter } from './cache/seaweedfs/seaweedfs-cache.adapter';
import { NfsNasAdapter } from './nas/nfs-nas.adapter';
import { NasClientProvider } from './nas/nas-client.provider';

/**
 * 캐시 스토리지 타입
 */
export type CacheStorageType = 'local' | 'seaweedfs';

@Module({
  imports: [ConfigModule],
  providers: [
    // ============================================
    // 캐시 스토리지 Provider (조건부)
    // ============================================
    {
      provide: CACHE_STORAGE_PORT,
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('StorageInfraModule');
        const cacheType = configService.get<CacheStorageType>('CACHE_STORAGE_TYPE', 'local');

        logger.log(`Initializing cache storage adapter: ${cacheType}`);

        switch (cacheType) {
          case 'seaweedfs':
            return new SeaweedFSCacheAdapter(configService);
          case 'local':
          default:
            return new LocalCacheAdapter(configService);
        }
      },
      inject: [ConfigService],
    },

    // ============================================
    // NAS 스토리지 Provider
    // ============================================
    NasClientProvider, // Provider로 등록해야 OnModuleInit이 호출됨
    {
      provide: NAS_STORAGE_PORT,
      useFactory: (nasClientProvider: NasClientProvider) => {
        const logger = new Logger('StorageInfraModule');
        logger.log('Initializing NAS storage adapter: NFS');
        return new NfsNasAdapter(nasClientProvider);
      },
      inject: [NasClientProvider],
    },
  ],
  exports: [CACHE_STORAGE_PORT, NAS_STORAGE_PORT],
})
export class StorageInfraModule {}

