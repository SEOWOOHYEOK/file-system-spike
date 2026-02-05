import { Transform, TransformCallback } from 'stream';
import { Logger } from '@nestjs/common';

/**
 * 진행률 콜백 타입
 */
export type ProgressCallback = (
  bytesTransferred: number,
  totalBytes: number,
  percent: number,
) => void;

/**
 * 진행률 모니터링 Transform 스트림
 * 
 * 대용량 파일 전송 시 진행률을 추적하고 콜백으로 전달합니다.
 * 
 * @param totalBytes - 전체 바이트 수
 * @param onProgress - 진행률 콜백 함수
 * @param logIntervalPercent - 로그 출력 간격 (기본값: 10%)
 */
export function createProgressStream(
  totalBytes: number,
  onProgress?: ProgressCallback,
  logIntervalPercent: number = 10,
): Transform {
  let bytesTransferred = 0;
  let lastLoggedPercent = 0;

  return new Transform({
    transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
      bytesTransferred += chunk.length;
      const percent = totalBytes > 0 
        ? Math.round((bytesTransferred / totalBytes) * 100) 
        : 0;

      // 콜백 호출
      if (onProgress) {
        onProgress(bytesTransferred, totalBytes, percent);
      }

      // 일정 간격으로만 로그 출력 (예: 10%, 20%, ...)
      if (percent >= lastLoggedPercent + logIntervalPercent) {
        lastLoggedPercent = Math.floor(percent / logIntervalPercent) * logIntervalPercent;
      }

      callback(null, chunk);
    },
  });
}

/**
 * 진행률 로거 생성
 * 
 * NAS 동기화 등에서 사용할 수 있는 진행률 로깅 함수를 생성합니다.
 * 
 * @param logger - NestJS Logger 인스턴스
 * @param fileId - 파일 ID (로그 식별용)
 * @param action - 작업 타입 (upload, download 등)
 * @param logIntervalPercent - 로그 출력 간격 (기본값: 10%)
 */
export function createProgressLogger(
  logger: Logger,
  fileId: string,
  action: string,
  logIntervalPercent: number = 10,
): { callback: ProgressCallback; getProgress: () => number } {
  let lastLoggedPercent = 0;
  let currentPercent = 0;
  const shortFileId = fileId.substring(0, 8);

  const callback: ProgressCallback = (bytesTransferred, totalBytes, percent) => {
    currentPercent = percent;

    // 일정 간격으로만 로그 출력
    if (percent >= lastLoggedPercent + logIntervalPercent || percent === 100) {
      const mbTransferred = (bytesTransferred / (1024 * 1024)).toFixed(1);
      const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
      
      logger.log(
        `[PROGRESS] 📊 ${action} | file=${shortFileId}... | ${percent}% | ${mbTransferred}MB / ${mbTotal}MB`,
      );
      
      lastLoggedPercent = Math.floor(percent / logIntervalPercent) * logIntervalPercent;
    }
  };

  return {
    callback,
    getProgress: () => currentPercent,
  };
}

/**
 * 바이트를 사람이 읽기 쉬운 형식으로 변환
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
