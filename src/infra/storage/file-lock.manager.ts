/**
 * 파일 단위 Read-Write Lock 관리자
 *
 * 동시성 제어:
 * - 읽기(Read): 동시 접근 허용 → 다운로드 성능 극대화
 * - 쓰기(Write): 배타적 잠금 → 데이터 무결성 보장
 * - 파일 단위 Lock: 서로 다른 파일은 독립적으로 처리
 */

import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import RWLock, { State } from 'async-rwlock';

interface LockEntry {
  lock: RWLock;
  refCount: number;
}

@Injectable()
export class FileLockManager implements OnModuleDestroy {
  private readonly logger = new Logger(FileLockManager.name);
  private readonly locks = new Map<string, LockEntry>();
  private readonly cleanupInterval: NodeJS.Timeout;

  /** Lock 획득 기본 타임아웃 (30초) */
  private readonly DEFAULT_TIMEOUT = 30_000;

  /** 사용하지 않는 Lock 정리 주기 (5분) */
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
    this.logger.log('FileLockManager initialized');
  }

  /**
   * 읽기 락 획득 (동시 접근 허용)
   * @param key 파일 키 (objectKey)
   * @param timeout 타임아웃 (ms), 기본 30초
   * @returns 락 해제 함수
   */
  async acquireRead(key: string, timeout?: number): Promise<() => void> {
    const entry = this.getOrCreateLock(key);
    const timeoutMs = timeout ?? this.DEFAULT_TIMEOUT;

    try {
      await entry.lock.readLock(timeoutMs);
    } catch (error) {
      this.decrementRef(key);
      throw new Error(`Read lock timeout for key: ${key}`);
    }

    return this.createReleaseFunction(key, entry);
  }

  /**
   * 쓰기 락 획득 (배타적 잠금)
   * @param key 파일 키 (objectKey)
   * @param timeout 타임아웃 (ms), 기본 30초
   * @returns 락 해제 함수
   */
  async acquireWrite(key: string, timeout?: number): Promise<() => void> {
    const entry = this.getOrCreateLock(key);
    const timeoutMs = timeout ?? this.DEFAULT_TIMEOUT;

    try {
      await entry.lock.writeLock(timeoutMs);
    } catch (error) {
      this.decrementRef(key);
      throw new Error(`Write lock timeout for key: ${key}`);
    }

    return this.createReleaseFunction(key, entry);
  }

  /**
   * 여러 키에 대해 쓰기 락 획득 (Deadlock 방지를 위해 키 정렬)
   * @param keys 파일 키 배열
   * @param timeout 타임아웃 (ms)
   * @returns 모든 락 해제 함수
   */
  async acquireWriteMultiple(keys: string[], timeout?: number): Promise<() => void> {
    // 키를 정렬하여 항상 같은 순서로 락 획득 (Deadlock 방지)
    const sortedKeys = [...keys].sort();
    const releases: Array<() => void> = [];

    try {
      for (const key of sortedKeys) {
        const release = await this.acquireWrite(key, timeout);
        releases.push(release);
      }
    } catch (error) {
      // 실패 시 이미 획득한 락 모두 해제 (역순)
      for (const release of releases.reverse()) {
        release();
      }
      throw error;
    }

    return () => {
      // 역순으로 해제
      for (const release of releases.reverse()) {
        release();
      }
    };
  }

  /**
   * 읽기+쓰기 락 획득 (파일 복사용: 원본 읽기, 대상 쓰기)
   * @param readKey 읽기 락 키
   * @param writeKey 쓰기 락 키
   * @param timeout 타임아웃 (ms)
   * @returns 모든 락 해제 함수
   */
  async acquireReadWrite(
    readKey: string,
    writeKey: string,
    timeout?: number,
  ): Promise<() => void> {
    // 키 정렬로 Deadlock 방지
    const [firstKey, secondKey] = [readKey, writeKey].sort();
    const isReadFirst = firstKey === readKey;

    let release1: () => void;
    let release2: () => void;

    try {
      if (isReadFirst) {
        release1 = await this.acquireRead(firstKey, timeout);
        release2 = await this.acquireWrite(secondKey, timeout);
      } else {
        release1 = await this.acquireWrite(firstKey, timeout);
        release2 = await this.acquireRead(secondKey, timeout);
      }
    } catch (error) {
      if (release1!) release1();
      throw error;
    }

    return () => {
      release2();
      release1();
    };
  }

  /**
   * Lock 또는 생성하여 가져오기
   */
  private getOrCreateLock(key: string): LockEntry {
    let entry = this.locks.get(key);
    if (!entry) {
      entry = { lock: new RWLock(), refCount: 0 };
      this.locks.set(key, entry);
    }
    entry.refCount++;
    return entry;
  }

  /**
   * 참조 카운트 감소
   */
  private decrementRef(key: string): void {
    const entry = this.locks.get(key);
    if (entry) {
      entry.refCount--;
    }
  }

  /**
   * 락 해제 함수 생성
   */
  private createReleaseFunction(key: string, entry: LockEntry): () => void {
    let released = false;
    return () => {
      if (released) return; // 중복 해제 방지
      released = true;
      entry.lock.unlock();
      this.decrementRef(key);
    };
  }

  /**
   * 사용하지 않는 Lock 정리
   */
  private cleanup(): void {
    let cleanedCount = 0;
    for (const [key, entry] of this.locks.entries()) {
      if (entry.refCount === 0) {
        this.locks.delete(key);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} unused locks`);
    }
  }

  /**
   * 현재 활성 Lock 수 조회 (모니터링용)
   */
  getActiveLockCount(): number {
    return this.locks.size;
  }

  /**
   * 특정 키의 Lock 상태 조회 (디버깅용)
   * @returns 'Idle' | 'Reading' | 'Writing' | null
   */
  getLockState(key: string): 'Idle' | 'Reading' | 'Writing' | null {
    const entry = this.locks.get(key);
    if (!entry) return null;
    const state = entry.lock.getState();
    switch (state) {
      case State.Idle:
        return 'Idle';
      case State.Reading:
        return 'Reading';
      case State.Writing:
        return 'Writing';
      default:
        return null;
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
    this.logger.log(`FileLockManager destroyed. Final lock count: ${this.locks.size}`);
  }
}
