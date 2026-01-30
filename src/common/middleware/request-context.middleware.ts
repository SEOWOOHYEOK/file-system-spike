import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { RequestContext } from '../context/request-context';
import { generateDeviceFingerprint } from '../utils/device-fingerprint.util';


/**
 * HTTP 요청 헤더에서 IP 주소 추출
 */
function extractIpAddress(req: Request): string {
  // X-Forwarded-For 헤더 확인 (프록시/로드밸런서 경유 시)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor.split(',')[0];
    return ips.trim();
  }

  // X-Real-IP 헤더 확인
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // 직접 연결된 IP
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * HTTP 요청에서 세션 ID 추출
 */
function extractSessionId(req: Request): string | undefined {
  // Authorization 헤더에서 토큰 추출하여 세션 ID로 사용할 수 있음
  // 또는 커스텀 헤더 사용
  const sessionHeader = req.headers['x-session-id'];
  if (sessionHeader) {
    return Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
  }

  // 쿠키에서 세션 ID 추출 (선택사항)
  // return req.cookies?.sessionId;

  return undefined;
}

/**
 * 타임스탬프 기반 Trace-ID 생성
 * 
 * OpenTelemetry/W3C Trace Context 표준에 맞춘 16바이트 hex 형식
 * - 타임스탬프(8바이트) + 랜덤(8바이트) = 16바이트 (32자 hex 문자열)
 * - 장점: 시간 정보 포함으로 로그 분석 및 DB 쿼리 최적화 가능
 * - 형식: "4bf92f3577b34da6a3ce929d0e0e4736"
 */
function generateTraceId(): string {
  const timestamp = Date.now(); // 밀리초 타임스탬프
  const random = crypto.randomBytes(8); // 8바이트 랜덤 데이터
  
  // 타임스탬프를 8바이트 버퍼로 변환 (Big-Endian)
  const timestampBuffer = Buffer.allocUnsafe(8);
  timestampBuffer.writeBigUInt64BE(BigInt(timestamp), 0);
  
  // 타임스탬프(8바이트) + 랜덤(8바이트) = 16바이트
  const traceIdBuffer = Buffer.concat([timestampBuffer, random]);
  
  // 32자 hex 문자열로 반환
  return traceIdBuffer.toString('hex');
}

/**
 * 트레이스 ID란?
 * - 트레이스 ID(Trace ID)는 하나의 HTTP 요청 또는 분산 트랜잭션을 추적하기 위한 고유 식별자입니다.
 * - 분산 시스템(여러 서비스, 마이크로서비스 구조 등)에서 요청의 흐름을 추적하고, 문제 발생 시 전체 경로를 파악할 수 있게 도와줍니다.
 * - 예: 한 사용자의 요청이 여러 서버/서비스를 거칠 때 각 서버가 같은 trace ID를 공유하면 전체 콜 체인을 쉽게 추적할 수 있습니다.
 * 
 * 어떻게 만들어지게 하는가?
 * - 일반적으로 클라이언트 또는 첫 번째 게이트웨이/프록시에서 'x-trace-id' HTTP 헤더를 설정합니다.
 * - 중간 서버가 trace ID를 가지고 있다면 그대로 전달하고, 없다면 타임스탬프 기반으로 새로 생성합니다.
 * - 타임스탬프 기반 생성: 시간 정보 포함으로 로그 분석 및 DB 쿼리 최적화에 유리합니다.
 */
function extractTraceId(req: Request): string {
  const traceHeader = req.headers['x-trace-id'];
  if (traceHeader) {
    // 헤더에 trace-id가 있으면 그대로 사용 (클라이언트/게이트웨이에서 전달)
    return Array.isArray(traceHeader) ? traceHeader[0] : traceHeader;
  }
  // 헤더가 없으면 타임스탬프 기반으로 새로 생성
  return generateTraceId();
}

/**
 * RequestContextMiddleware
 *
 * 모든 HTTP 요청에 대해 컨텍스트 정보 설정
 * - 요청 ID 생성
 * - IP 주소, User-Agent 추출
 * - 디바이스 핑거프린트 생성
 * - Trace-ID 생성 (타임스탬프 기반)
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = uuidv4();
    const ipAddress = extractIpAddress(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const sessionId = extractSessionId(req);
    const traceId = extractTraceId(req);
    const deviceFingerprint = generateDeviceFingerprint(ipAddress, userAgent);

    // 응답 헤더에 요청 ID 추가 (디버깅용)
    res.setHeader('X-Request-Id', requestId);
    // 응답 헤더에 Trace-ID 추가 (선택사항, 디버깅용)
    res.setHeader('X-Trace-Id', traceId);

    RequestContext.run(
      {
        requestId,
        sessionId,
        traceId,
        ipAddress,
        userAgent,
        deviceFingerprint,
        startTime: Date.now(),
      },
      () => next(),
    );
  }
}
