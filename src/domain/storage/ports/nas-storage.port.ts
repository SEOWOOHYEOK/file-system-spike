/**
 * NAS 스토리지 포트
 * 실제 구현은 Infrastructure에서 어댑터로 제공됩니다.
 *
 * 구현체:
 * - NfsNasAdapter: NFS 기반 NAS
 */

import { Readable } from 'stream';

/**
 * NAS 스토리지 인터페이스
 */
export interface INasStoragePort {
  // ============================================
  // 파일 작업
  // ============================================

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
   * 청크 쓰기 (대용량 파일 병렬 업로드용)
   * 파일의 특정 위치(offset)에 데이터를 씁니다.
   * 
   * @param objectKey - 저장 경로/키
   * @param data - 청크 데이터
   * @param offset - 파일 내 시작 위치 (bytes)
   */
  청크쓰기(objectKey: string, data: Buffer, offset: number): Promise<void>;

  /**
   * 파일 사전 할당 (대용량 파일 병렬 업로드 전 호출)
   * 지정된 크기의 빈 파일을 미리 생성합니다.
   * 
   * @param objectKey - 저장 경로/키
   * @param totalSize - 전체 파일 크기 (bytes)
   */
  파일사전할당(objectKey: string, totalSize: number): Promise<void>;

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
   * 파일 부분 읽기 (Range Request 지원)
   * @param objectKey - 저장 경로/키
   * @param start - 시작 바이트 위치 (inclusive)
   * @param end - 끝 바이트 위치 (inclusive)
   * @returns 부분 파일 스트림
   */
  파일범위스트림읽기(objectKey: string, start: number, end: number): Promise<Readable>;

  /**
   * 파일 삭제
   * @param objectKey - 저장 경로/키
   */
  파일삭제(objectKey: string): Promise<void>;

  /**
   * 파일 이동/이름변경
   * @param oldKey - 기존 경로/키
   * @param newKey - 새 경로/키
   */
  파일이동(oldKey: string, newKey: string): Promise<void>;

  /**
   * 파일 복사
   * @param sourceKey - 원본 경로/키
   * @param destKey - 대상 경로/키
   */
  파일복사(sourceKey: string, destKey: string): Promise<void>;

  // ============================================
  // 폴더 작업
  // ============================================

  /**
   * 폴더 생성
   * @param path - 폴더 경로
   */
  폴더생성(path: string): Promise<void>;

  /**
   * 폴더 삭제
   * @param path - 폴더 경로
   * @param recursive - 하위 항목 포함 삭제 여부
   */
  폴더삭제(path: string, recursive?: boolean): Promise<void>;

  /**
   * 폴더 이동/이름변경
   * @param oldPath - 기존 경로
   * @param newPath - 새 경로
   */
  폴더이동(oldPath: string, newPath: string): Promise<void>;

  // ============================================
  // 공통 작업
  // ============================================

  /**
   * 파일/폴더 존재 확인
   * @param objectKey - 경로/키
   * @returns 존재 여부
   */
  존재확인(objectKey: string): Promise<boolean>;

  /**
   * 파일 크기 조회
   * @param objectKey - 저장 경로/키
   * @returns 파일 크기 (bytes)
   */
  파일크기조회(objectKey: string): Promise<number>;

  /**
   * 폴더 내 항목 목록 조회
   * @param path - 폴더 경로
   * @returns 항목 목록
   */
  폴더내부항목조회(path: string): Promise<string[]>;
}

/**
 * NAS 스토리지 포트 토큰 (의존성 주입용)
 */
export const NAS_STORAGE_PORT = Symbol('NAS_STORAGE_PORT');
