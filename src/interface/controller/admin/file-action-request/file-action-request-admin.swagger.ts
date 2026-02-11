import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiBody, ApiResponse, ApiParam } from '@nestjs/swagger';
import { FileActionRequestResponseDto } from '../../file-action-request/dto/file-action-request-response.dto';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { BulkApproveRequestDto, BulkRejectRequestDto } from './dto/bulk-request.dto';

export const ApiGetAllRequests = () =>
  applyDecorators(
    ApiOperation({
      summary: '[Admin] 파일 작업 요청 전체 목록 조회',
      description: '관리자가 모든 파일 작업 요청을 필터링하여 조회합니다.',
    }),
    ApiResponse({ status: 200, description: '조회 성공' }),
  );

export const ApiGetSummary = () =>
  applyDecorators(
    ApiOperation({
      summary: '[Admin] 파일 작업 요청 상태별 요약',
      description: '각 상태별 요청 건수를 반환합니다.',
    }),
    ApiResponse({ status: 200, description: '조회 성공' }),
  );

export const ApiGetMyPending = () =>
  applyDecorators(
    ApiOperation({
      summary: '[Admin] 내 승인 대기 목록',
      description: '로그인한 관리자에게 지정된 PENDING 요청 목록을 조회합니다.',
    }),
    ApiResponse({ status: 200, description: '조회 성공' }),
  );

export const ApiGetAdminRequestDetail = () =>
  applyDecorators(
    ApiOperation({
      summary: '[Admin] 파일 작업 요청 상세 조회',
      description: '특정 파일 작업 요청의 상세 정보를 조회합니다.',
    }),
    ApiParam({ name: 'id', description: '요청 ID', format: 'uuid' }),
    ApiResponse({ status: 200, description: '조회 성공', type: FileActionRequestResponseDto }),
    ApiResponse({ status: 404, description: '요청을 찾을 수 없음' }),
  );

export const ApiApproveRequest = () =>
  applyDecorators(
    ApiOperation({
      summary: '[Admin] 파일 작업 요청 승인',
      description: 'PENDING 상태의 요청을 승인합니다. 승인 시 낙관적 검증 후 자동 실행됩니다.',
    }),
    ApiParam({ name: 'id', description: '요청 ID', format: 'uuid' }),
    ApiBody({ type: ApproveRequestDto }),
    ApiResponse({ status: 200, description: '승인 성공', type: FileActionRequestResponseDto }),
    ApiResponse({ status: 400, description: '승인할 수 없는 상태' }),
    ApiResponse({ status: 404, description: '요청을 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '파일 상태 변경으로 무효화' }),
  );

export const ApiRejectRequest = () =>
  applyDecorators(
    ApiOperation({
      summary: '[Admin] 파일 작업 요청 반려',
      description: 'PENDING 상태의 요청을 반려합니다. 반려 사유는 필수입니다.',
    }),
    ApiParam({ name: 'id', description: '요청 ID', format: 'uuid' }),
    ApiBody({ type: RejectRequestDto }),
    ApiResponse({ status: 200, description: '반려 성공', type: FileActionRequestResponseDto }),
    ApiResponse({ status: 400, description: '반려할 수 없는 상태 또는 사유 누락' }),
    ApiResponse({ status: 404, description: '요청을 찾을 수 없음' }),
  );

export const ApiBulkApprove = () =>
  applyDecorators(
    ApiOperation({
      summary: '[Admin] 파일 작업 요청 일괄 승인',
      description: '여러 PENDING 요청을 일괄 승인합니다.',
    }),
    ApiBody({ type: BulkApproveRequestDto }),
    ApiResponse({ status: 200, description: '일괄 승인 성공' }),
  );

export const ApiBulkReject = () =>
  applyDecorators(
    ApiOperation({
      summary: '[Admin] 파일 작업 요청 일괄 반려',
      description: '여러 PENDING 요청을 일괄 반려합니다. 반려 사유는 필수입니다.',
    }),
    ApiBody({ type: BulkRejectRequestDto }),
    ApiResponse({ status: 200, description: '일괄 반려 성공' }),
  );
