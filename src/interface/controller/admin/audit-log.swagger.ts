/**
 * Audit Log Controller Swagger 데코레이터
 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { AuditAction } from '../../../domain/audit/enums/audit-action.enum';
import { FileChangeType } from '../../../domain/audit/enums/file-change.enum';
import { LogResult, TargetType, UserType } from '../../../domain/audit/enums/common.enum';

export const ApiGetAuditLogs = () =>
  applyDecorators(
    ApiOperation({ summary: '감사 로그 목록 조회' }),
    ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호 (기본값: 1)' }),
    ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지 크기 (기본값: 50)' }),
    ApiQuery({ name: 'userId', required: false, type: String, description: '사용자 ID' }),
    ApiQuery({ name: 'userType', required: false, enum: UserType, description: '사용자 유형' }),
    ApiQuery({ name: 'action', required: false, enum: AuditAction, description: '감사 액션' }),
    ApiQuery({ name: 'targetType', required: false, enum: TargetType, description: '대상 타입' }),
    ApiQuery({ name: 'targetId', required: false, type: String, description: '대상 ID' }),
    ApiQuery({ name: 'result', required: false, enum: LogResult, description: '결과' }),
    ApiQuery({ name: 'ipAddress', required: false, type: String, description: 'IP 주소' }),
    ApiQuery({ name: 'startDate', required: false, type: String, description: '조회 시작일 (ISO 8601)' }),
    ApiQuery({ name: 'endDate', required: false, type: String, description: '조회 종료일 (ISO 8601)' }),
    ApiResponse({ status: 200, description: '감사 로그 목록 조회 성공' }),
  );

export const ApiGetAuditLog = () =>
  applyDecorators(
    ApiOperation({ summary: '감사 로그 상세 조회' }),
    ApiParam({ name: 'id', type: String, description: '감사 로그 ID (UUID)' }),
    ApiResponse({ status: 200, description: '감사 로그 상세 조회 성공' }),
    ApiResponse({ status: 404, description: '감사 로그를 찾을 수 없음' }),
  );

export const ApiGetAuditLogsByUser = () =>
  applyDecorators(
    ApiOperation({ summary: '특정 사용자의 감사 로그 조회' }),
    ApiParam({ name: 'userId', type: String, description: '사용자 ID (UUID)' }),
    ApiQuery({ name: 'limit', required: false, type: Number, description: '조회할 최대 개수 (기본값: 100)' }),
    ApiResponse({ status: 200, description: '사용자 감사 로그 조회 성공' }),
  );

export const ApiGetAuditLogsByTarget = () =>
  applyDecorators(
    ApiOperation({ summary: '특정 대상의 접근 이력 조회' }),
    ApiParam({ name: 'targetType', enum: TargetType, description: '대상 타입' }),
    ApiParam({ name: 'targetId', type: String, description: '대상 ID (UUID)' }),
    ApiQuery({ name: 'limit', required: false, type: Number, description: '조회할 최대 개수 (기본값: 100)' }),
    ApiResponse({ status: 200, description: '대상 접근 이력 조회 성공' }),
  );

export const ApiGetAuditLogsBySession = () =>
  applyDecorators(
    ApiOperation({ summary: '특정 세션의 활동 로그 조회' }),
    ApiParam({ name: 'sessionId', type: String, description: '세션 ID' }),
    ApiResponse({ status: 200, description: '세션 활동 로그 조회 성공' }),
  );

export const ApiGetFileHistories = () =>
  applyDecorators(
    ApiOperation({ summary: '파일 이력 목록 조회' }),
    ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호 (기본값: 1)' }),
    ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지 크기 (기본값: 50)' }),
    ApiQuery({ name: 'fileId', required: false, type: String, description: '파일 ID' }),
    ApiQuery({ name: 'changeType', required: false, enum: FileChangeType, description: '변경 타입' }),
    ApiQuery({ name: 'changedBy', required: false, type: String, description: '변경한 사용자 ID' }),
    ApiQuery({ name: 'startDate', required: false, type: String, description: '조회 시작일 (ISO 8601)' }),
    ApiQuery({ name: 'endDate', required: false, type: String, description: '조회 종료일 (ISO 8601)' }),
    ApiResponse({ status: 200, description: '파일 이력 목록 조회 성공' }),
  );

export const ApiGetFileHistoryByFile = () =>
  applyDecorators(
    ApiOperation({ summary: '특정 파일의 변경 이력 조회' }),
    ApiParam({ name: 'fileId', type: String, description: '파일 ID (UUID)' }),
    ApiQuery({ name: 'limit', required: false, type: Number, description: '조회할 최대 개수 (기본값: 100)' }),
    ApiResponse({ status: 200, description: '파일 변경 이력 조회 성공' }),
  );

export const ApiGetFileHistoryByVersion = () =>
  applyDecorators(
    ApiOperation({ summary: '특정 파일의 특정 버전 조회' }),
    ApiParam({ name: 'fileId', type: String, description: '파일 ID (UUID)' }),
    ApiParam({ name: 'version', type: Number, description: '버전 번호' }),
    ApiResponse({ status: 200, description: '파일 버전 조회 성공' }),
    ApiResponse({ status: 404, description: '파일 버전을 찾을 수 없음' }),
  );

export const ApiGetFileHistoryByUser = () =>
  applyDecorators(
    ApiOperation({ summary: '특정 사용자가 변경한 파일 이력 조회' }),
    ApiParam({ name: 'userId', type: String, description: '사용자 ID (UUID)' }),
    ApiQuery({ name: 'limit', required: false, type: Number, description: '조회할 최대 개수 (기본값: 100)' }),
    ApiResponse({ status: 200, description: '사용자 변경 이력 조회 성공' }),
  );
