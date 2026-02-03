import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FavoriteTargetTypeDto } from './dto/favorite.dto';

/**
 * User Favorite API Swagger 데코레이터
 */

// ========== 즐겨찾기 API ==========

export const AddFavoriteSwagger = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: '즐겨찾기 등록',
      description: '파일 또는 폴더를 즐겨찾기에 등록합니다.',
    }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          targetType: {
            type: 'string',
            enum: Object.values(FavoriteTargetTypeDto),
            description: '대상 타입 (FILE 또는 FOLDER)',
            example: 'FOLDER',
          },
          targetId: {
            type: 'string',
            format: 'uuid',
            description: '대상 ID',
            example: '550e8400-e29b-41d4-a716-446655440000',
          },
        },
        required: ['targetType', 'targetId'],
      },
    }),
    ApiResponse({
      status: 201,
      description: '즐겨찾기 등록 성공',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '즐겨찾기 ID' },
          targetType: { type: 'string', description: '대상 타입' },
          targetId: { type: 'string', description: '대상 ID' },
          createdAt: { type: 'string', format: 'date-time', description: '등록 시각' },
        },
      },
    }),
    ApiResponse({
      status: 401,
      description: '인증 정보가 없습니다.',
    }),
    ApiResponse({
      status: 409,
      description: '이미 즐겨찾기에 등록된 항목입니다.',
    }),
  );

export const RemoveFavoriteSwagger = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: '즐겨찾기 해제',
      description: '파일 또는 폴더를 즐겨찾기에서 해제합니다.',
    }),
    ApiParam({
      name: 'targetType',
      enum: FavoriteTargetTypeDto,
      description: '대상 타입 (FILE 또는 FOLDER)',
      example: 'FOLDER',
    }),
    ApiParam({
      name: 'targetId',
      description: '대상 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440000',
    }),
    ApiResponse({
      status: 200,
      description: '즐겨찾기 해제 성공',
      schema: {
        type: 'object',
        properties: {
          message: { type: 'string', example: '즐겨찾기가 해제되었습니다.' },
        },
      },
    }),
    ApiResponse({
      status: 401,
      description: '인증 정보가 없습니다.',
    }),
    ApiResponse({
      status: 404,
      description: '즐겨찾기를 찾을 수 없습니다.',
    }),
  );

export const GetFavoritesSwagger = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: '즐겨찾기 목록 조회',
      description:
        '현재 사용자의 즐겨찾기 목록을 조회합니다. ' +
        'type 파라미터로 파일 또는 폴더만 필터링할 수 있습니다.',
    }),
    ApiQuery({
      name: 'type',
      required: false,
      enum: FavoriteTargetTypeDto,
      description: '대상 타입 필터 (FILE 또는 FOLDER)',
    }),
    ApiResponse({
      status: 200,
      description: '즐겨찾기 목록 반환',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '즐겨찾기 ID' },
            targetType: { type: 'string', description: '대상 타입' },
            targetId: { type: 'string', description: '대상 ID' },
            createdAt: { type: 'string', format: 'date-time', description: '등록 시각' },
          },
        },
      },
    }),
    ApiResponse({
      status: 401,
      description: '인증 정보가 없습니다.',
    }),
  );

// ========== 최근 활동 API ==========

export const GetRecentActivitiesSwagger = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: '최근 파일 활동 조회',
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
