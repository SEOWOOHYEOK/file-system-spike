import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiBody, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CreateMoveRequestDto } from './dto/create-move-request.dto';
import { CreateDeleteRequestDto } from './dto/create-delete-request.dto';
import { FileActionRequestResponseDto } from './dto/file-action-request-response.dto';

export const ApiCreateMoveRequest = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 이동 요청 생성',
      description: '관리자에게 파일 이동을 요청합니다. 동일 파일에 PENDING 요청이 있으면 차단됩니다.',
    }),
    ApiBody({ type: CreateMoveRequestDto }),
    ApiResponse({ status: 201, description: '이동 요청 생성 성공', type: FileActionRequestResponseDto }),
    ApiResponse({ status: 400, description: '잘못된 요청' }),
    ApiResponse({ status: 404, description: '파일 또는 폴더를 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '중복 요청' }),
  );

export const ApiCreateDeleteRequest = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 삭제 요청 생성',
      description: '관리자에게 파일 삭제를 요청합니다. 동일 파일에 PENDING 요청이 있으면 차단됩니다.',
    }),
    ApiBody({ type: CreateDeleteRequestDto }),
    ApiResponse({ status: 201, description: '삭제 요청 생성 성공', type: FileActionRequestResponseDto }),
    ApiResponse({ status: 400, description: '잘못된 요청' }),
    ApiResponse({ status: 404, description: '파일을 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '중복 요청' }),
  );

export const ApiGetMyRequests = () =>
  applyDecorators(
    ApiOperation({
      summary: '내 파일 작업 요청 목록 조회',
      description: '로그인한 사용자가 생성한 파일 작업 요청 목록을 조회합니다.',
    }),
    ApiResponse({ status: 200, description: '조회 성공' }),
  );

export const ApiGetApprovers = () =>
  applyDecorators(
    ApiOperation({
      summary: '승인 가능 사용자 목록 조회',
      description: '파일 작업 요청의 승인자 후보 목록을 조회합니다.',
    }),
    ApiQuery({ name: 'type', enum: ['MOVE', 'DELETE'], description: '요청 타입', required: true }),
    ApiResponse({ status: 200, description: '조회 성공' }),
  );

export const ApiGetRequestDetail = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 작업 요청 상세 조회',
      description: '특정 파일 작업 요청의 상세 정보를 조회합니다.',
    }),
    ApiParam({ name: 'id', description: '요청 ID', format: 'uuid' }),
    ApiResponse({ status: 200, description: '조회 성공', type: FileActionRequestResponseDto }),
    ApiResponse({ status: 404, description: '요청을 찾을 수 없음' }),
  );

export const ApiCancelRequest = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 작업 요청 취소',
      description: '본인이 생성한 PENDING 상태의 요청을 취소합니다.',
    }),
    ApiParam({ name: 'id', description: '요청 ID', format: 'uuid' }),
    ApiResponse({ status: 200, description: '취소 성공', type: FileActionRequestResponseDto }),
    ApiResponse({ status: 400, description: '취소할 수 없는 상태' }),
    ApiResponse({ status: 403, description: '본인의 요청이 아님' }),
    ApiResponse({ status: 404, description: '요청을 찾을 수 없음' }),
  );
