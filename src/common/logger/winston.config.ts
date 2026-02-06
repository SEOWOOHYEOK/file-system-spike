/**
 * Winston 로거 설정 파일
 *
 * 이 파일은 애플리케이션 전체에서 사용하는 Winston 로거의 핵심 설정을 정의한다.
 * - 민감정보 마스킹: 로그에 비밀번호, 토큰 등이 노출되지 않도록 자동 필터링
 * - 요청 컨텍스트 주입: 각 로그에 traceId, userId 등 추적 정보를 자동 부착
 * - 파일 로테이션: 일별로 로그 파일을 분리하고, 크기/기간 제한으로 디스크 관리
 * - 환경별 분기: 개발(debug+컬러 콘솔) / 프로덕션(info+JSON) 자동 전환
 */
import * as winston from 'winston';
// winston-daily-rotate-file: 날짜별로 로그 파일을 자동 분리(로테이션)하는 트랜스포트 플러그인
// import만 하면 winston.transports에 DailyRotateFile이 등록된다
import 'winston-daily-rotate-file';
// RequestContext: AsyncLocalStorage 기반으로 현재 요청의 컨텍스트(traceId, userId 등)를 저장/조회하는 유틸리티
import { RequestContext } from '../context/request-context';

// ─────────────────────────────────────────────
// 민감정보 마스킹 필터
// ─────────────────────────────────────────────

/**
 * 마스킹 대상 키 목록
 * 로그 메타데이터의 키 이름에 아래 문자열이 포함되면 값을 '***MASKED***'로 치환한다.
 * 대소문자 구분 없이 매칭한다. (예: 'Authorization', 'AUTHORIZATION' 모두 마스킹)
 */
const sensitiveKeys = [
  'password', // 비밀번호
  'token', // 일반 토큰
  'secret', // 시크릿 키
  'authorization', // HTTP Authorization 헤더 값
  'cookie', // 쿠키 값
  'creditCard', // 신용카드 번호
  'ssn', // 주민등록번호(Social Security Number)
  'accessToken', // OAuth/JWT 액세스 토큰
  'refreshToken', // OAuth/JWT 리프레시 토큰
];

/**
 * 객체를 재귀적으로 순회하며 민감정보를 마스킹하는 함수
 *
 * @param obj - 마스킹할 대상 객체
 * @returns 민감 키의 값이 '***MASKED***'로 치환된 새 객체 (원본 불변)
 *
 * 동작 방식:
 * 1. null이거나 객체가 아니면 그대로 반환
 * 2. 배열이면 얕은 복사, 객체면 얕은 복사하여 원본을 보호
 * 3. 각 키를 소문자로 변환 후 sensitiveKeys에 포함되는지 검사
 * 4. 매칭되면 값을 '***MASKED***'로 교체
 * 5. 매칭되지 않고 값이 객체이면 재귀적으로 내부도 마스킹
 */
function maskSensitive(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const masked = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(masked)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      masked[key] = '***MASKED***';
    } else if (typeof masked[key] === 'object') {
      masked[key] = maskSensitive(masked[key]);
    }
  }
  return masked;
}

// ─────────────────────────────────────────────
// 요청 컨텍스트 자동 주입 포맷
// ─────────────────────────────────────────────

/**
 * Winston 커스텀 포맷: 현재 HTTP 요청의 컨텍스트 정보를 로그에 자동 주입
 *
 * AsyncLocalStorage 기반의 RequestContext에서 현재 요청 정보를 꺼내
 * 로그 메시지(info 객체)에 아래 필드를 추가한다:
 *   - traceId   : 요청 추적 ID (분산 트레이싱용, 없으면 'no-trace')
 *   - requestId : 개별 요청 식별자 (없으면 'no-request')
 *   - userId    : 요청한 사용자 ID (미인증이면 'anonymous')
 *   - userType  : 사용자 유형 (없으면 'unknown')
 *   - ipAddress : 클라이언트 IP 주소 (없으면 'unknown')
 *   - sessionId : 세션 ID (없으면 undefined → JSON 직렬화 시 생략됨)
 *
 * 또한 info.metadata가 존재하면 민감정보 마스킹을 적용한다.
 *
 * 끝의 ()는 즉시 실행으로, winston.format() 팩토리가 반환하는 Format 인스턴스를 생성한다.
 */
const contextFormat = winston.format((info) => {
  // AsyncLocalStorage에서 현재 요청 컨텍스트를 조회
  const ctx = RequestContext.get();
  if (ctx) {
    info.traceId = ctx.traceId || 'no-trace';
    info.requestId = ctx.requestId || 'no-request';
    info.userId = ctx.userId || 'anonymous';
    info.userType = ctx.userType || 'unknown';
    info.ipAddress = ctx.ipAddress || 'unknown';
    info.sessionId = ctx.sessionId || undefined;
  }
  // 메타데이터가 있으면 민감정보를 마스킹 처리
  if (info.metadata) {
    info.metadata = maskSensitive(info.metadata);
  }
  return info;
})(); // ← ()로 즉시 실행하여 Format 인스턴스 생성

// ─────────────────────────────────────────────
// JSON 구조화 포맷 (파일 저장용)
// ─────────────────────────────────────────────

/**
 * 파일에 저장할 때 사용하는 JSON 구조화 포맷
 *
 * combine()으로 여러 포맷을 파이프라인처럼 순서대로 적용한다:
 * 1. timestamp  : ISO 8601 형식(예: 2026-02-06T15:30:00.000+0900)의 타임스탬프 추가
 * 2. contextFormat : 위에서 정의한 요청 컨텍스트(traceId 등) 주입 + 민감정보 마스킹
 * 3. errors     : Error 객체의 stack trace를 로그에 포함 (stack: true)
 * 4. json       : 최종 결과를 JSON 문자열로 직렬화 → 파일에 한 줄씩 기록됨
 */
const jsonFormat = winston.format.combine(
  // ISO 8601 형식 타임스탬프 (밀리초 + 타임존 오프셋 포함)
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  // 요청 컨텍스트 주입 및 민감정보 마스킹
  contextFormat,
  // Error 객체 발생 시 stack trace를 message와 함께 로그에 포함
  winston.format.errors({ stack: true }),
  // 모든 필드를 JSON 문자열로 직렬화 (파일 저장, ELK 등 로그 수집기 파싱에 적합)
  winston.format.json(),
);

// ─────────────────────────────────────────────
// 콘솔 출력 포맷 (개발환경용)
// ─────────────────────────────────────────────

/**
 * 개발 환경 콘솔 출력용 포맷
 *
 * 사람이 읽기 쉽도록 컬러 + 한 줄 요약 형태로 출력한다.
 * 출력 예시: 15:30:00.123 info [FileService][abc-123][user1] 파일 업로드 완료
 */
const consoleFormat = winston.format.combine(
  // 시:분:초.밀리초 형식 (날짜 생략 → 콘솔에서 간결하게 표시)
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  // 요청 컨텍스트 주입
  contextFormat,
  // 로그 레벨에 ANSI 색상 적용 (error=빨강, warn=노랑, info=초록, debug=파랑 등)
  winston.format.colorize(),
  // 커스텀 출력 포맷: 한 줄로 정리
  winston.format.printf(
    ({ timestamp, level, message, traceId, userId, context }) => {
      // traceId가 있으면 [traceId] 형태로 표시
      const trace = traceId ? `[${traceId}]` : '';
      // userId가 있고 'anonymous'가 아니면 [userId] 표시 (인증된 사용자만)
      const user = userId && userId !== 'anonymous' ? `[${userId}]` : 'unknown';
      // context는 NestJS Logger에서 넘겨주는 클래스/서비스 이름 (예: FileService)
      const ctx = context ? `[${context}]` : '';
      // 최종 출력 형식: "시간 레벨 [서비스명][traceId][userId] 메시지"
      return `${timestamp} ${level} ${ctx}${trace}${user} ${message}`;
    },
  ),
);

// ─────────────────────────────────────────────
// Winston 설정 팩토리 함수
// ─────────────────────────────────────────────

/**
 * Winston 로거 설정 객체를 생성하는 팩토리 함수
 *
 * @param logDir - 로그 파일을 저장할 디렉토리 경로 (기본값: 'logs')
 * @returns Winston 설정 객체 { transports, exceptionHandlers }
 *
 * 환경별 동작:
 * - 개발(NODE_ENV !== 'production'):
 *   콘솔에 debug 레벨부터 컬러 포맷으로 출력
 * - 프로덕션(NODE_ENV === 'production'):
 *   콘솔에 info 레벨부터 JSON 포맷으로 출력 + 감사 로그 파일 추가 생성
 */
export function createWinstonConfig(logDir = 'logs') {
  // NODE_ENV 환경변수로 프로덕션 여부 판별
  const isProduction = process.env.NODE_ENV === 'production';

  const transports: winston.transport[] = [
    // ── 1. 콘솔 트랜스포트 (모든 환경에서 활성화) ──
    new winston.transports.Console({
      // level: 이 레벨 이상의 로그만 출력
      //   - 개발: 'debug' (debug, info, warn, error 모두 출력)
      //   - 프로덕션: 'info' (info, warn, error만 출력, debug 제외)
      level: isProduction ? 'info' : 'debug',
      // format: 출력 포맷
      //   - 개발: consoleFormat (컬러 + 사람 읽기 쉬운 한 줄 포맷)
      //   - 프로덕션: jsonFormat (JSON 구조화 → 로그 수집기에 적합)
      format: isProduction ? jsonFormat : consoleFormat,
    }),

    // ── 2. 전체 로그 파일 (일별 로테이션) ──
    // 모든 info 레벨 이상 로그를 날짜별 파일로 저장
    new (winston.transports as any).DailyRotateFile({
      // dirname: 로그 파일이 저장될 디렉토리 경로
      dirname: logDir,
      // filename: 파일명 패턴 (%DATE%는 datePattern으로 치환됨)
      //   예: app-2026-02-06.log
      filename: 'app-%DATE%.log',
      // datePattern: 파일명의 %DATE% 부분에 적용할 날짜 형식
      //   'YYYY-MM-DD' → 하루에 하나의 파일이 생성됨
      datePattern: 'YYYY-MM-DD',
      // maxSize: 단일 파일 최대 크기 (20MB 초과 시 새 파일로 분리)
      maxSize: '20m',
      // maxFiles: 보관 기간 ('14d' = 14일 지난 파일은 자동 삭제)
      maxFiles: '14d',
      // level: info 이상 로그만 기록 (debug는 파일에 저장하지 않음)
      level: 'info',
      // format: JSON 구조화 포맷으로 저장 (파싱/검색 용이)
      format: jsonFormat,
    }),

    // ── 3. 에러 전용 파일 (빠른 장애 추적용) ──
    // error 레벨 로그만 별도 파일에 저장하여 장애 시 빠르게 확인 가능
    new (winston.transports as any).DailyRotateFile({
      // dirname: 로그 파일 저장 디렉토리
      dirname: logDir,
      // filename: 에러 전용 파일명 패턴 (예: error-2026-02-06.log)
      filename: 'error-%DATE%.log',
      // datePattern: 일별 로테이션
      datePattern: 'YYYY-MM-DD',
      // maxSize: 단일 파일 최대 20MB
      maxSize: '20m',
      // maxFiles: 에러 로그는 30일간 보관 (일반 로그보다 길게)
      maxFiles: '30d',
      // level: 'error' 레벨만 기록 (warn, info, debug는 제외)
      level: 'error',
      // format: JSON 구조화 포맷
      format: jsonFormat,
    }),
  ];

  // ── 4. 감사(Audit) 로그 파일 (프로덕션 전용) ──
  // 프로덕션 환경에서만 감사 로그를 별도 파일로 저장
  // 감사 로그: 사용자 행위 추적, 보안 감사, 컴플라이언스 용도
  if (isProduction) {
    transports.push(
      new (winston.transports as any).DailyRotateFile({
        // dirname: 로그 파일 저장 디렉토리
        dirname: logDir,
        // filename: 감사 로그 파일명 패턴 (예: audit-2026-02-06.log)
        filename: 'audit-%DATE%.log',
        // datePattern: 일별 로테이션
        datePattern: 'YYYY-MM-DD',
        // maxSize: 감사 로그는 최대 50MB (일반 로그보다 큰 용량 허용)
        maxSize: '50m',
        // maxFiles: 365일(1년)간 보관 — 감사 로그는 법적/규정 요구사항에 따라 장기 보관
        maxFiles: '365d',
        // level: info 이상 기록
        level: 'info',
        // format: JSON 구조화 포맷
        format: jsonFormat,
      }),
    );
  }

  return {
    // transports: 위에서 구성한 로그 전송 대상 배열 (콘솔 + 파일들)
    transports,

    // ── 5. 미처리 예외(Uncaught Exception) 핸들러 ──
    // process에서 잡히지 않은 예외가 발생하면 이 파일에 기록
    // try-catch로 잡지 못한 런타임 에러를 놓치지 않기 위한 안전장치
    exceptionHandlers: [
      new (winston.transports as any).DailyRotateFile({
        // dirname: 로그 파일 저장 디렉토리
        dirname: logDir,
        // filename: 예외 로그 파일명 패턴 (예: exceptions-2026-02-06.log)
        filename: 'exceptions-%DATE%.log',
        // datePattern: 일별 로테이션
        datePattern: 'YYYY-MM-DD',
        // maxFiles: 7일간 보관 (예외 로그는 빠르게 확인 후 해결하므로 짧게)
        maxFiles: '7d',
        // format: JSON 구조화 포맷
        format: jsonFormat,
      }),
    ],
  };
}
