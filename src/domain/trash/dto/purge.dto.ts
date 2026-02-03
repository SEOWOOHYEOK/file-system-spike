/**
 * 휴지통 영구삭제 관련 DTO
 */

/**
 * 영구삭제 응답 DTO
 */
export interface PurgeResponse {
  id: string;
  name: string;
  type: 'FILE' | 'FOLDER';
  purgedAt: string;
}
