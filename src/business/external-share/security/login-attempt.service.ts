import { Injectable, Logger } from '@nestjs/common';

/**
 * 로그인 시도 정보
 */
interface LoginAttempt {
  failedCount: number;
  lastAttempt: Date;
  lockedUntil?: Date;
}

/**
 * LoginAttemptService
 *
 * 로그인 실패 횟수를 추적하고 계정 잠금을 관리합니다.
 *
 * 보안 정책:
 * - 5회 연속 실패 시 30분 잠금
 * - 성공적인 로그인 시 실패 횟수 초기화
 * - 잠금 해제 후 실패 횟수 초기화
 *
 * ⚠️ 주의: 현재 메모리 기반 구현입니다.
 * 프로덕션 환경에서는 Redis 등 분산 캐시 사용을 권장합니다.
 */
@Injectable()
export class LoginAttemptService {
  private readonly logger = new Logger(LoginAttemptService.name);

  // 설정 값
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCK_DURATION_MINUTES = 30;

  // 메모리 저장소 (프로덕션에서는 Redis 권장)
  private readonly attempts = new Map<string, LoginAttempt>();

  /**
   * 로그인 시도 가능 여부 확인
   * @returns 잠금 상태 정보
   */
  canAttemptLogin(username: string): {
    allowed: boolean;
    remainingAttempts?: number;
    lockedUntil?: Date;
    lockRemainingSeconds?: number;
  } {
    const attempt = this.attempts.get(username);

    if (!attempt) {
      return { allowed: true, remainingAttempts: this.MAX_FAILED_ATTEMPTS };
    }

    // 잠금 상태 확인
    if (attempt.lockedUntil) {
      const now = new Date();
      if (now < attempt.lockedUntil) {
        const lockRemainingSeconds = Math.ceil(
          (attempt.lockedUntil.getTime() - now.getTime()) / 1000,
        );
        return {
          allowed: false,
          lockedUntil: attempt.lockedUntil,
          lockRemainingSeconds,
        };
      }
      // 잠금 해제 → 초기화
      this.attempts.delete(username);
      return { allowed: true, remainingAttempts: this.MAX_FAILED_ATTEMPTS };
    }

    const remainingAttempts = this.MAX_FAILED_ATTEMPTS - attempt.failedCount;
    return { allowed: true, remainingAttempts };
  }

  /**
   * 로그인 실패 기록
   */
  recordFailedAttempt(username: string): {
    failedCount: number;
    isLocked: boolean;
    lockedUntil?: Date;
  } {
    const attempt = this.attempts.get(username) || {
      failedCount: 0,
      lastAttempt: new Date(),
    };

    attempt.failedCount += 1;
    attempt.lastAttempt = new Date();

    // 최대 실패 횟수 도달 시 잠금
    if (attempt.failedCount >= this.MAX_FAILED_ATTEMPTS) {
      attempt.lockedUntil = new Date(
        Date.now() + this.LOCK_DURATION_MINUTES * 60 * 1000,
      );
      this.logger.warn(
        `Account locked: ${username}, until: ${attempt.lockedUntil.toISOString()}`,
      );
    }

    this.attempts.set(username, attempt);

    return {
      failedCount: attempt.failedCount,
      isLocked: !!attempt.lockedUntil,
      lockedUntil: attempt.lockedUntil,
    };
  }

  /**
   * 로그인 성공 시 실패 기록 초기화
   */
  clearFailedAttempts(username: string): void {
    this.attempts.delete(username);
  }

  /**
   * 수동 잠금 해제 (관리자용)
   */
  unlockAccount(username: string): boolean {
    const deleted = this.attempts.delete(username);
    if (deleted) {
      this.logger.log(`Account unlocked by admin: ${username}`);
    }
    return deleted;
  }

  /**
   * 현재 잠긴 계정 목록 조회 (관리자용)
   */
  getLockedAccounts(): Array<{ username: string; lockedUntil: Date }> {
    const now = new Date();
    const locked: Array<{ username: string; lockedUntil: Date }> = [];

    this.attempts.forEach((attempt, username) => {
      if (attempt.lockedUntil && attempt.lockedUntil > now) {
        locked.push({ username, lockedUntil: attempt.lockedUntil });
      }
    });

    return locked;
  }
}
