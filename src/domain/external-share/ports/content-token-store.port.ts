/**
 * 콘텐츠 토큰 저장소 포트
 *
 * 일회성 콘텐츠 접근 토큰을 저장/조회/삭제하는 인터페이스
 * Redis 또는 인메모리 구현체로 교체 가능
 */
export interface IContentTokenStore {
  /**
   * 토큰 저장
   * @param key 토큰 키
   * @param value 토큰 데이터 (JSON 문자열)
   * @param ttlSeconds 만료 시간 (초)
   */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;

  /**
   * 토큰 조회
   * @param key 토큰 키
   * @returns 토큰 데이터 또는 null
   */
  get(key: string): Promise<string | null>;

  /**
   * 토큰 삭제
   * @param key 토큰 키
   */
  del(key: string): Promise<void>;
}

export const CONTENT_TOKEN_STORE = Symbol('CONTENT_TOKEN_STORE');
