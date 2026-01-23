/**
 * 캐시 스토리지 포트
 * 실제 구현은 Infrastructure에서 어댑터로 제공됩니다.
 *
 * 구현체:
 * - LocalCacheAdapter: 로컬 파일 시스템
 * - SeaweedFSCacheAdapter: SeaweedFS 분산 파일 시스템
 */

import { Readable } from 'stream';

/**
 * 캐시 스토리지 인터페이스
 */
export interface ICacheStoragePort {
  /**
   * 파일 쓰기 (Buffer)
   * @param objectKey - 저장 경로/키
   * @param data - 파일 데이터
   */
  파일쓰기(objectKey: string, data: Buffer): Promise<void>;

  /**
   * 파일 쓰기 (Stream)
   * @param objectKey - 저장 경로/키
   * @param stream - 파일 스트림
   */
  파일스트림쓰기(objectKey: string, stream: Readable): Promise<void>;

  /**
   * 파일 읽기 (Buffer)
   * @param objectKey - 저장 경로/키
   * @returns 파일 데이터
   */
  파일읽기(objectKey: string): Promise<Buffer>;

  /**
   * 파일 읽기 (Stream)
   * @param objectKey - 저장 경로/키
   * @returns 파일 스트림
   */
  파일스트림읽기(objectKey: string): Promise<Readable>;

  /**
   * 파일 삭제
   * @param objectKey - 저장 경로/키
   */
  파일삭제(objectKey: string): Promise<void>;

  /**
   * 파일 존재 확인
   * @param objectKey - 저장 경로/키
   * @returns 존재 여부
   */
  파일존재확인(objectKey: string): Promise<boolean>;

  /**
   * 파일 이동/이름변경
   * @param oldKey - 기존 경로/키
   * @param newKey - 새 경로/키
   */
  파일이동(oldKey: string, newKey: string): Promise<void>;

  /**
   * 파일 크기 조회
   * @param objectKey - 저장 경로/키
   * @returns 파일 크기 (bytes)
   */
  파일크기조회(objectKey: string): Promise<number>;
}

/**
 * 캐시 스토리지 포트 토큰 (의존성 주입용)
 */
export const CACHE_STORAGE_PORT = Symbol('CACHE_STORAGE_PORT');
