/**
 * 휴지통 영구삭제 관련 DTO
 */

/**
 * 영구삭제 응답 DTO
 */
export interface PurgeResponse {
  id: string;
  name: string;
  type: 'FILE'; // 폴더는 휴지통에 가지 않음
  purgedAt: string;
}
