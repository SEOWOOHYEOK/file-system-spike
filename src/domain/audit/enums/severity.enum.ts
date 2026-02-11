/**
 * 심각도
 *
 * AuditLog, SystemEvent 등 모든 이벤트 로그에서 공통으로 사용
 */
export enum Severity {
  INFO = 'INFO', // 정보 (관찰)
  WARN = 'WARN', // 경고 (부분 제한)
  HIGH = 'HIGH', // 높음 (즉시 확인 필요)
  CRITICAL = 'CRITICAL', // 심각 (즉시 차단)
}

/**
 * 심각도 한국어 설명
 */
export const SeverityDescription: Record<Severity, string> = {
  [Severity.INFO]: '정보 - 관찰만',
  [Severity.WARN]: '경고 - 부분 제한 필요',
  [Severity.HIGH]: '높음 - 즉시 확인 필요',
  [Severity.CRITICAL]: '심각 - 즉시 차단 필요',
};
