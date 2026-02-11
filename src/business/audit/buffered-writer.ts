import { Logger, OnModuleDestroy } from '@nestjs/common';

/**
 * 버퍼 설정 인터페이스
 */
export interface BufferConfig {
  /** 최대 버퍼 크기 (이 크기에 도달하면 즉시 플러시) */
  maxSize: number;
  /** 자동 플러시 간격 (밀리초) */
  flushIntervalMs: number;
}

const DEFAULT_BUFFER_CONFIG: BufferConfig = {
  maxSize: 100,
  flushIntervalMs: 5000,
};

/**
 * BufferedWriter<T>
 *
 * 감사/이력 로그를 버퍼에 모았다가 배치로 저장하는 공통 추상 클래스.
 *
 * 공통 책임:
 * - 메모리 버퍼링 (DB 부하 감소)
 * - 주기적 자동 플러시
 * - 버퍼 한도 초과 시 즉시 플러시
 * - 앱 종료 시 잔여 데이터 저장
 * - 플러시 실패 시 재시도 (버퍼 복원)
 *
 * 하위 클래스 책임:
 * - persistBatch(): 실제 DB 저장 로직
 * - entityName: 로그 메시지에 사용할 엔티티 이름
 */
export abstract class BufferedWriter<T> implements OnModuleDestroy {
  protected readonly logger: Logger;
  private readonly buffer: T[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly config: BufferConfig;

  constructor(
    loggerContext: string,
    config?: Partial<BufferConfig>,
  ) {
    this.logger = new Logger(loggerContext);
    this.config = { ...DEFAULT_BUFFER_CONFIG, ...config };
    this.startAutoFlush();
  }

  /** 실제 DB 배치 저장 (하위 클래스 구현) */
  protected abstract persistBatch(items: T[]): Promise<void>;

  /** 로그 메시지에 사용할 엔티티 이름 (예: 'audit logs', 'file histories') */
  protected abstract get entityName(): string;

  // ──────────────────────────────────────────────
  //  공개 API
  // ──────────────────────────────────────────────

  /**
   * 항목을 버퍼에 추가.
   * 버퍼가 가득 차면 즉시 플러시.
   */
  async enqueue(item: T): Promise<void> {
    this.buffer.push(item);

    if (this.buffer.length >= this.config.maxSize) {
      await this.flush();
    }
  }

  /**
   * 버퍼의 모든 항목을 DB에 저장.
   * 실패 시 항목을 버퍼에 복원하여 재시도.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const itemsToSave = [...this.buffer];
    this.buffer.length = 0;

    try {
      await this.persistBatch(itemsToSave);
      this.logger.debug(`로그 반영 완료 ${itemsToSave.length} ${this.entityName}`);
    } catch (error) {
      this.logger.error(
        `로그 반영 실패 ${itemsToSave.length} ${this.entityName}`,
        error,
      );
      // 실패한 항목을 다시 버퍼에 추가 (재시도)
      this.buffer.push(...itemsToSave);
    }
  }

  /**
   * 현재 버퍼 크기 (테스트/모니터링용)
   */
  get bufferSize(): number {
    return this.buffer.length;
  }

  // ──────────────────────────────────────────────
  //  생명주기
  // ──────────────────────────────────────────────

  async onModuleDestroy(): Promise<void> {
    this.stopAutoFlush();
    await this.flush();
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(async () => {
      await this.flush();
    }, this.config.flushIntervalMs);
  }

  private stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
