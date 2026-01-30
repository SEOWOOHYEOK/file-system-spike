/**
 * 스토리지 도메인 모듈 내보내기
 *
 * 왜 아래처럼 "개별 심볼 지정" 내보내기를 써야 하나?
 * (즉, index.ts에서 export * from './file'로 못 하는 이유)
 *
 * - export * from './file'은 하위 파일의 모든 export 심볼이 모듈 외부로 노출되어, domain 경계 밖에서 의도치 않은 internal/비공개 타입까지 사용하게 될 수 있습니다.
 * - 도메인 레이어는 "최소화된 공개, 필요한 것만 내보내기" 원칙이 중요합니다(불필요한 internal symbol, private helper 등은 감추고 엔티티/서비스/포트 등만 공개).
 * - 특히 TransactionOptions와 같이 파일/폴더 별로 내부적으로 다를 수 있는 type을 index에서 분리 alias(별칭)하여 내보내면, 
 *   서로 혼용, 오사용을 구조적으로 방지할 수 있고, IDE 사용 시에도 타입 자동완성/경고 등이 명확해집니다.
 * - 만약 'TransactionOptions' 등 공용 타입(ex. public interface)이 정말 모든 스토리지에서 동일하다면, 그 정의만을 별도의 공유 파일(ex 'storage.common.ts'나 'ports/transaction-options.ts')에 두고, 거기서 export하여 index.ts로 한 번에 내보내는 것도 좋은 패턴입니다.
 *     단, 현실적으로 파일/폴더 스토리지별로 각각 특수화되어 있거나 타입이 달라질 개연성이 있다면 지금처럼 별칭을 붙여 개별 내보내는 구조가 더 적합합니다.
 *
 * 결론: 
 *  index에서 "필요한 symbol만 명시적으로 내보내고, TransactionOptions도 alias로 분리"하는 구조가 domain 경계 유지를 위한 가장 안전한 방법입니다.
 *
 * (정리: 타입 TransactionOptions를 각 폴더/파일 storage에서 별칭으로 지정·내보내도 문제없으며,
 *  오히려 exports * from './file' 등은 내부 설계 노출 및 경계 침범 리스크가 있습니다.)
 */

// 파일 스토리지
export {
  FileStorageObjectEntity,
  StorageType,
  AvailabilityStatus,
  FILE_STORAGE_OBJECT_REPOSITORY,
  FileCacheStorageDomainService,
  FileNasStorageDomainService,
} from './file';
export type {
  IFileStorageObjectRepository,
  TransactionOptions as FileStorageTransactionOptions,
} from './file';

// 폴더 스토리지
export {
  FolderStorageObjectEntity,
  FolderAvailabilityStatus,
  FOLDER_STORAGE_OBJECT_REPOSITORY,
  FolderNasStorageObjectDomainService,
} from './folder';
export type {
  IFolderStorageObjectRepository,
  TransactionOptions as FolderStorageTransactionOptions,
} from './folder';

// 포트 (인터페이스)
export * from './ports';

// 모듈
export * from './storage.module';
