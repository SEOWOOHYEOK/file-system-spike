import * as crypto from 'crypto';

/**
 * User-Agent 파서 결과
 */
interface ParsedUserAgent {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  device: string;
}

/**
 * User-Agent 문자열 파싱
 */
function parseUserAgent(userAgent: string): ParsedUserAgent {
  const result: ParsedUserAgent = {
    browser: 'unknown',
    browserVersion: '',
    os: 'unknown',
    osVersion: '',
    device: 'unknown',
  };

  if (!userAgent || userAgent === 'unknown') {
    return result;
  }

  // OS 감지
  if (userAgent.includes('Windows')) {
    result.os = 'Windows';
    const match = userAgent.match(/Windows NT (\d+\.?\d*)/);
    if (match) {
      result.osVersion = match[1];
    }
  } else if (userAgent.includes('Mac OS X')) {
    result.os = 'macOS';
    const match = userAgent.match(/Mac OS X (\d+[_\.]\d+[_\.]?\d*)/);
    if (match) {
      result.osVersion = match[1].replace(/_/g, '.');
    }
  } else if (userAgent.includes('Linux')) {
    result.os = 'Linux';
  } else if (userAgent.includes('Android')) {
    result.os = 'Android';
    const match = userAgent.match(/Android (\d+\.?\d*)/);
    if (match) {
      result.osVersion = match[1];
    }
  } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    result.os = 'iOS';
    const match = userAgent.match(/OS (\d+[_\.]\d+[_\.]?\d*)/);
    if (match) {
      result.osVersion = match[1].replace(/_/g, '.');
    }
  }

  // 브라우저 감지
  if (userAgent.includes('Edge/') || userAgent.includes('Edg/')) {
    result.browser = 'Edge';
    const match = userAgent.match(/Edg[e]?\/(\d+\.?\d*)/);
    if (match) {
      result.browserVersion = match[1];
    }
  } else if (userAgent.includes('Chrome/') && !userAgent.includes('Chromium')) {
    result.browser = 'Chrome';
    const match = userAgent.match(/Chrome\/(\d+\.?\d*)/);
    if (match) {
      result.browserVersion = match[1];
    }
  } else if (userAgent.includes('Firefox/')) {
    result.browser = 'Firefox';
    const match = userAgent.match(/Firefox\/(\d+\.?\d*)/);
    if (match) {
      result.browserVersion = match[1];
    }
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
    result.browser = 'Safari';
    const match = userAgent.match(/Version\/(\d+\.?\d*)/);
    if (match) {
      result.browserVersion = match[1];
    }
  }

  // 디바이스 타입 감지
  if (userAgent.includes('Mobile') || userAgent.includes('Android')) {
    if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
      result.device = 'tablet';
    } else {
      result.device = 'mobile';
    }
  } else {
    result.device = 'desktop';
  }

  return result;
}



/**
 * 클라이언트 타입 감지
 *
 * User-Agent를 분석하여 클라이언트 타입 반환
 */
export function detectClientType(
  userAgent: string,
): 'web' | 'mobile' | 'api' | 'unknown' {
  if (!userAgent || userAgent === 'unknown') {
    return 'unknown';
  }

  // API 클라이언트 감지
  const apiPatterns = [
    'axios',
    'fetch',
    'postman',
    'insomnia',
    'curl',
    'httpie',
    'python-requests',
    'got',
  ];

  const lowerUserAgent = userAgent.toLowerCase();
  if (apiPatterns.some((pattern) => lowerUserAgent.includes(pattern))) {
    return 'api';
  }

  // 모바일 감지
  if (
    lowerUserAgent.includes('mobile') ||
    lowerUserAgent.includes('android') ||
    lowerUserAgent.includes('iphone') ||
    lowerUserAgent.includes('ipad')
  ) {
    return 'mobile';
  }

  // 웹 브라우저
  if (
    lowerUserAgent.includes('mozilla') ||
    lowerUserAgent.includes('chrome') ||
    lowerUserAgent.includes('safari') ||
    lowerUserAgent.includes('firefox') ||
    lowerUserAgent.includes('edge')
  ) {
    return 'web';
  }

  return 'unknown';
}

/**
 * User-Agent 정보 추출
 *
 * 로그 메타데이터에 포함할 수 있는 파싱된 정보 반환
 */
export function extractUserAgentInfo(userAgent: string): ParsedUserAgent {
  return parseUserAgent(userAgent);
}
