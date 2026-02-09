import { Injectable, OnModuleInit, NotFoundException, Inject } from '@nestjs/common';
import { ErrorCodes, getErrorDefinition } from '../exceptions/error-codes';
import { ErrorMessage } from '../../domain/error-message/entities/error-message.entity';
import type { IErrorMessageRepository } from '../../domain/error-message/repositories/error-message.repository.interface';
import { ERROR_MESSAGE_REPOSITORY } from '../../domain/error-message/repositories/error-message.repository.interface';

/**
 * ErrorMessageService
 *
 * 에러 메시지를 DB에서 로드하고 메모리 캐시에 저장하는 서비스
 * - 애플리케이션 시작 시 모든 에러 메시지를 DB에서 로드하여 캐시
 * - ErrorCodes에서 기본 메시지를 시드 (DB가 비어있는 경우)
 * - 5분 TTL로 캐시 자동 갱신
 * - 런타임에 메시지 변경 지원
 */
@Injectable()
export class ErrorMessageService implements OnModuleInit {
  private cache = new Map<number, ErrorMessage>();
  private lastLoadedAt: Date | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5분

  constructor(
    @Inject(ERROR_MESSAGE_REPOSITORY)
    private readonly repository: IErrorMessageRepository,
  ) {}

  /**
   * 모듈 초기화 시 기본 메시지 시드 및 캐시 로드
   */
  async onModuleInit() {
    await this.seedDefaults();
    await this.reloadCache();
  }

  /**
   * ErrorCodes에서 기본 메시지를 DB에 시드
   * - 기존 레코드가 있으면 customMessage를 보존하고 defaultMessage만 업데이트
   * - 새 레코드만 삽입
   */
  private async seedDefaults() {
    const existingMessages = await this.repository.findAll();
    const existingCodes = new Set(existingMessages.map((msg) => msg.errorCode));

    const defaults: ErrorMessage[] = [];
    const updates: ErrorMessage[] = [];

    for (const def of Object.values(ErrorCodes)) {
      const existing = existingMessages.find((msg) => msg.errorCode === def.code);

      if (existing) {
        // 기존 레코드가 있으면 defaultMessage만 업데이트 (customMessage 보존)
        if (existing.defaultMessage !== def.defaultMessage) {
          const updated = ErrorMessage.create({
            errorCode: existing.errorCode,
            internalCode: existing.internalCode,
            httpStatus: existing.httpStatus,
            defaultMessage: def.defaultMessage,
            customMessage: existing.customMessage,
            updatedAt: existing.updatedAt,
            updatedBy: existing.updatedBy,
          });
          updates.push(updated);
        }
      } else {
        // 새 레코드 삽입
        const newMessage = ErrorMessage.create({
          errorCode: def.code,
          internalCode: def.internalCode,
          httpStatus: def.httpStatus,
          defaultMessage: def.defaultMessage,
        });
        defaults.push(newMessage);
      }
    }

    // 새 레코드 삽입
    if (defaults.length > 0) {
      await this.repository.upsertMany(defaults);
    }

    // 기존 레코드 업데이트 (defaultMessage만 변경)
    for (const update of updates) {
      await this.repository.save(update);
    }
  }

  /**
   * 캐시 강제 재로드
   */
  async reloadCache(): Promise<void> {
    const all = await this.repository.findAll();
    this.cache.clear();
    for (const msg of all) {
      this.cache.set(msg.errorCode, msg);
    }
    this.lastLoadedAt = new Date();
  }

  /**
   * 캐시 만료 여부 확인
   */
  private isCacheExpired(): boolean {
    if (!this.lastLoadedAt) return true;
    return Date.now() - this.lastLoadedAt.getTime() > this.CACHE_TTL_MS;
  }

  /**
   * 에러 코드에 대한 메시지 조회
   *
   * @param errorCode - 에러 코드
   * @returns 실제 사용할 메시지
   */
  async getMessage(errorCode: number): Promise<string> {
    // 캐시 만료 시 자동 재로드
    if (this.isCacheExpired()) {
      await this.reloadCache();
    }

    // 캐시에서 조회
    const cached = this.cache.get(errorCode);
    if (cached) {
      return cached.effectiveMessage;
    }

    // 캐시에 없으면 ErrorCodes에서 조회 (fallback)
    const def = getErrorDefinition(errorCode);
    if (def) {
      return def.defaultMessage;
    }

    // 모든 곳에서 찾을 수 없으면 UNKNOWN_ERROR 메시지 반환
    return ErrorCodes.UNKNOWN_ERROR.defaultMessage;
  }

  /**
   * 커스텀 메시지 업데이트
   *
   * @param code - 에러 코드
   * @param customMessage - 커스텀 메시지 (null이면 기본 메시지 사용)
   * @param adminId - 수정한 관리자 ID
   * @returns 업데이트된 ErrorMessage
   */
  async updateMessage(
    code: number,
    customMessage: string | null,
    adminId: string,
  ): Promise<ErrorMessage> {
    const existing = await this.repository.findByCode(code);
    if (!existing) {
      throw new NotFoundException(`에러 코드를 찾을 수 없습니다: ${code}`);
    }

    const updated = existing.updateCustomMessage(customMessage, adminId);
    const saved = await this.repository.save(updated);

    // 캐시 즉시 업데이트
    this.cache.set(code, saved);

    return saved;
  }

  /**
   * 모든 캐시된 에러 메시지 조회
   *
   * @returns ErrorMessage 배열
   */
  getAll(): ErrorMessage[] {
    return Array.from(this.cache.values());
  }
}
