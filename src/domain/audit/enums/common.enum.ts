/**
 * 사용자 타입
 */
export enum UserType {
  INTERNAL = 'INTERNAL', // 내부 사용자
  EXTERNAL = 'EXTERNAL', // 외부 사용자
}

/**
 * 사용자 타입 한국어 설명
 */
export const UserTypeDescription: Record<UserType, string> = {
  [UserType.INTERNAL]: '내부 사용자',
  [UserType.EXTERNAL]: '외부 사용자',
};

/**
 * 대상 타입
 */
export enum TargetType {
  FILE = 'file',
  FOLDER = 'folder',
  SHARE = 'share',
  USER = 'user',
  FAVORITE = 'favorite',
  ACTIVITY = 'activity',
  SYSTEM = 'system',
}

/**
 * 대상 타입 한국어 설명
 */
export const TargetTypeDescription: Record<TargetType, string> = {
  [TargetType.FILE]: '파일',
  [TargetType.FOLDER]: '폴더',
  [TargetType.SHARE]: '공유',
  [TargetType.USER]: '사용자',
  [TargetType.FAVORITE]: '즐겨찾기',
  [TargetType.ACTIVITY]: '활동',
  [TargetType.SYSTEM]: '시스템',
};

/**
 * 로그 결과
 */
export enum LogResult {
  SUCCESS = 'SUCCESS',
  FAIL = 'FAIL',
}

/**
 * 로그 결과 한국어 설명
 */
export const LogResultDescription: Record<LogResult, string> = {
  [LogResult.SUCCESS]: '성공',
  [LogResult.FAIL]: '실패',
};

/**
 * 클라이언트 타입
 */
export enum ClientType {
  WEB = 'web',
  MOBILE = 'mobile',
  API = 'api',
  UNKNOWN = 'unknown',
}

/**
 * 클라이언트 타입 한국어 설명
 */
export const ClientTypeDescription: Record<ClientType, string> = {
  [ClientType.WEB]: '웹 브라우저',
  [ClientType.MOBILE]: '모바일 앱',
  [ClientType.API]: 'API 클라이언트',
  [ClientType.UNKNOWN]: '알 수 없음',
};

/**
 * 기밀 등급
 */
export enum Sensitivity {
  PUBLIC = 'PUBLIC', // 공개
  INTERNAL = 'INTERNAL', // 내부용
  CONFIDENTIAL = 'CONFIDENTIAL', // 기밀
}

/**
 * 기밀 등급 한국어 설명
 */
export const SensitivityDescription: Record<Sensitivity, string> = {
  [Sensitivity.PUBLIC]: '공개',
  [Sensitivity.INTERNAL]: '내부용',
  [Sensitivity.CONFIDENTIAL]: '기밀',
};
