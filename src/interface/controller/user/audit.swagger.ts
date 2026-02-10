import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RecentActivityItemDto } from './dto/recent-activity.dto';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto';

export const GetAuditLogSwagger = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: '사용자 파일/폴더 활동 내역 조회',
      description:
        '현재 로그인한 사용자의 파일/폴더 관련 활동을 최근순으로 조회합니다.\n\n' +
        '- 페이지네이션 지원 (page, pageSize)\n' +
        '- actions 파라미터로 특정 액션만 필터링 가능\n' +
        '- 허용 액션: FILE_VIEW, FILE_DOWNLOAD, FILE_UPLOAD, FILE_RENAME, FILE_MOVE, FILE_DELETE, FILE_RESTORE, FILE_PURGE, ' +
        'FOLDER_CREATE, FOLDER_VIEW, FOLDER_RENAME, FOLDER_MOVE, FOLDER_DELETE\n' +
        '- 무한 스크롤: hasNext가 true이면 다음 페이지 요청',
    }),
    ApiResponse({
      status: 200,
      description: '사용자 활동 내역 (페이지네이션)',
      schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: '활동 목록',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', description: '액션 타입', example: 'FILE_DOWNLOAD' },
                actionCategory: { type: 'string', description: '액션 카테고리', example: 'FILE' },
                targetType: { type: 'string', description: '대상 타입', example: 'FILE' },
                targetId: { type: 'string', description: '대상 ID' },
                targetName: { type: 'string', description: '대상 이름', example: '계약서.pdf' },
                targetPath: { type: 'string', description: '대상 경로', example: '/documents/contracts/' },
                result: { type: 'string', description: '결과', example: 'SUCCESS' },
                createdAt: { type: 'string', format: 'date-time', description: '활동 시각' },
              },
            },
          },
          page: { type: 'number', description: '현재 페이지', example: 1 },
          pageSize: { type: 'number', description: '페이지 크기', example: 20 },
          totalItems: { type: 'number', description: '전체 아이템 수', example: 150 },
          totalPages: { type: 'number', description: '전체 페이지 수', example: 8 },
          hasNext: { type: 'boolean', description: '다음 페이지 존재 여부', example: true },
          hasPrev: { type: 'boolean', description: '이전 페이지 존재 여부', example: false },
        },
      },
    }),
    ApiResponse({
      status: 401,
      description: '인증 정보가 없습니다.',
    }),
  );
