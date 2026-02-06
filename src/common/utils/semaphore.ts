/**
 * Promise 기반 Semaphore
 *
 * 동시에 실행할 수 있는 비동기 작업의 수를 제한합니다.
 * 외부 라이브러리 없이 순수 구현.
 *
 * @example
 * const sem = new Semaphore(5);
 * await sem.acquire();
 * try {
 *   // 최대 5개까지만 동시 실행
 * } finally {
 *   sem.release();
 * }
 */
export class Semaphore {
  private current = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(private readonly max: number) {
    if (max < 1) {
      throw new Error(`Semaphore max must be >= 1, received ${max}`);
    }
  }

  /**
   * 슬롯 획득 (슬롯이 없으면 대기)
   */
  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }

    // 슬롯이 없으면 대기열에 등록
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * 슬롯 해제
   */
  release(): void {
    if (this.waitQueue.length > 0) {
      // 대기 중인 작업이 있으면 바로 넘겨줌
      const next = this.waitQueue.shift()!;
      // current는 그대로 유지 (슬롯이 바로 재사용됨)
      next();
    } else {
      this.current--;
    }
  }

  /** 현재 사용 가능한 슬롯 수 */
  get available(): number {
    return this.max - this.current;
  }

  /** 대기 중인 작업 수 */
  get waiting(): number {
    return this.waitQueue.length;
  }

  /** 현재 점유 중인 슬롯 수 */
  get active(): number {
    return this.current;
  }

  /** 최대 슬롯 수 */
  get capacity(): number {
    return this.max;
  }
}
