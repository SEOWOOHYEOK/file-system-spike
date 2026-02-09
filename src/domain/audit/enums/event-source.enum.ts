/**
 * 이벤트 소스
 *
 * 관찰 가능성 이벤트의 출처를 분류
 */
export enum EventSource {
  /** 사용자 행위 + 보안 이벤트 */
  AUDIT = 'AUDIT',

  /** 파일 상태 변경 이력 */
  FILE_CHANGE = 'FILE_CHANGE',

  /** 인프라/시스템 자동 이벤트 */
  SYSTEM = 'SYSTEM',
}

/**
 * 이벤트 소스 한국어 설명
 */
export const EventSourceDescription: Record<EventSource, string> = {
  [EventSource.AUDIT]: '사용자 행위',
  [EventSource.FILE_CHANGE]: '파일 변경',
  [EventSource.SYSTEM]: '시스템 이벤트',
};
