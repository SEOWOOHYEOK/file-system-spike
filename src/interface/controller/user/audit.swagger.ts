import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';



export const GetAuditLogSwagger = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: '사용자 활동 내역 조회',
      description:
        '현재 사용자의 최근 파일/폴더 활동을 조회합니다. ' +
        'actions 파라미터로 특정 액션만 필터링할 수 있습니다.',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: '조회 개수 (기본 20, 최대 100)',
      example: 20,
    }),
    ApiQuery({
      name: 'actions',
      required: false,
      type: String,
      description: '필터할 액션 (쉼표 구분)',
      example: 'FILE_VIEW,FILE_DOWNLOAD,FILE_UPLOAD //export enum AuditAction 참고',
    }),
    ApiResponse({
      status: 200,
      description: '최근 활동 목록 반환',
      schema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: '사용자 ID' },
          activities: {
            type: 'array',
            description: '활동 목록',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', description: '액션 타입', example: 'FILE_DOWNLOAD' },
                actionCategory: { type: 'string', description: '액션 카테고리', example: 'file' },
                targetType: { type: 'string', description: '대상 타입', example: 'file' },
                targetId: { type: 'string', description: '대상 ID' },
                targetName: { type: 'string', description: '대상 이름', example: '계약서.pdf' },
                targetPath: { type: 'string', description: '대상 경로', example: '/documents/contracts/' },
                result: { type: 'string', description: '결과', example: 'SUCCESS' },
                createdAt: { type: 'string', format: 'date-time', description: '활동 시각' },
              },
            },
          },
          total: { type: 'number', description: '총 개수' },
        },
      },
    }),
    ApiResponse({
      status: 401,
      description: '인증 정보가 없습니다.',
    }),
  );
