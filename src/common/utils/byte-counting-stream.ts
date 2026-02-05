/**
 * 바이트 카운팅 Transform 스트림
 * 전송된 바이트 수를 카운팅하고 예상 크기와 비교하여 검증합니다.
 */
import { Transform, TransformCallback } from 'stream';
import { Logger } from '@nestjs/common';

/**
 * 바이트 카운팅 스트림 생성
 * 
 * 스트림이 완료되면 예상 크기와 실제 바이트 수를 비교하여
 * 불일치 시 경고 로그를 출력합니다.
 * 
 * @param expectedSize - 예상 파일 크기 (bytes)
 * @param logger - NestJS Logger 인스턴스
 * @param fileId - 로깅용 파일 ID
 * @param rangeInfo - Range 요청 정보 (진단용)
 * @returns Transform 스트림
 */
export function createByteCountingStream(
  expectedSize: number,
  logger: Logger,
  fileId: string,
  rangeInfo?: string,
): Transform {
  let bytesRead = 0;
  const shortFileId = fileId.substring(0, 8);
  const rangeTag = rangeInfo ? ` [${rangeInfo}]` : '';

  return new Transform({
    transform(chunk: Buffer, encoding: string, callback: TransformCallback) {
      bytesRead += chunk.length;
      callback(null, chunk);
    },
    flush(callback: TransformCallback) {
      if (bytesRead !== expectedSize) {
        logger.error(
          `[BYTE_MISMATCH] ❌ file=${shortFileId}...${rangeTag} | expected=${expectedSize} | actual=${bytesRead} | diff=${expectedSize - bytesRead}`,
        );
      } else {
        logger.debug(
          `[TRANSFER_OK] ✅ file=${shortFileId}...${rangeTag} | bytes=${bytesRead}`,
        );
      }
      callback();
    },
  });
}
