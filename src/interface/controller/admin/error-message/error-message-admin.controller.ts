import { Controller, Get, Patch, Post, Param, Body, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { ErrorMessageService } from '../../../../common/error-message/error-message.service';

/**
 * 에러 메시지 관리 컨트롤러
 * 
 * 엔드포인트:
 * - GET   /v1/admin/error-messages           - 전체 에러 코드/메시지 목록 조회
 * - PATCH /v1/admin/error-messages/:code      - 특정 코드의 커스텀 메시지 수정
 * - POST  /v1/admin/error-messages/reload     - 캐시 즉시 갱신
 */
@ApiTags('500.관리자')
@Controller('v1/admin/error-messages')
export class ErrorMessageAdminController {
  constructor(
    private readonly errorMessageService: ErrorMessageService,
  ) {}

  /**
   * GET /v1/admin/error-messages
   * 전체 에러 코드/메시지 목록 조회
   */
  @Get()
  @ApiOperation({ summary: '에러 메시지 목록 조회', description: '등록된 모든 에러 코드와 메시지를 조회합니다.' })
  @ApiResponse({ status: 200, description: '에러 메시지 목록' })
  async getAll() {
    const messages = this.errorMessageService.getAll();
    return messages.map((msg) => ({
      errorCode: msg.errorCode,
      internalCode: msg.internalCode,
      httpStatus: msg.httpStatus,
      defaultMessage: msg.defaultMessage,
      customMessage: msg.customMessage,
      effectiveMessage: msg.effectiveMessage,
      updatedAt: msg.updatedAt,
      updatedBy: msg.updatedBy,
    }));
  }

  /**
   * PATCH /v1/admin/error-messages/:code
   * 특정 코드의 커스텀 메시지 수정
   */
  @Patch(':code')
  @ApiOperation({ summary: '에러 메시지 수정', description: '특정 에러 코드의 커스텀 메시지를 수정합니다. null을 전송하면 기본 메시지로 복원됩니다.' })
  @ApiParam({ name: 'code', type: Number, description: '에러 코드 (숫자)' })
  @ApiBody({ schema: { type: 'object', properties: { customMessage: { type: 'string', nullable: true, description: '커스텀 메시지 (null이면 기본 메시지 사용)' } } } })
  @ApiResponse({ status: 200, description: '수정된 에러 메시지' })
  async updateMessage(
    @Param('code', ParseIntPipe) code: number,
    @Body() body: { customMessage: string | null },
  ) {
    // TODO: 실제 인증된 관리자 ID를 가져올 것
    const adminId = 'admin';
    const updated = await this.errorMessageService.updateMessage(code, body.customMessage, adminId);
    return {
      errorCode: updated.errorCode,
      internalCode: updated.internalCode,
      httpStatus: updated.httpStatus,
      defaultMessage: updated.defaultMessage,
      customMessage: updated.customMessage,
      effectiveMessage: updated.effectiveMessage,
      updatedAt: updated.updatedAt,
      updatedBy: updated.updatedBy,
    };
  }

  /**
   * POST /v1/admin/error-messages/reload
   * 캐시 즉시 갱신
   */
  @Post('reload')
  @ApiOperation({ summary: '에러 메시지 캐시 갱신', description: 'DB에서 에러 메시지를 다시 로드하여 캐시를 즉시 갱신합니다.' })
  @ApiResponse({ status: 200, description: '캐시 갱신 완료' })
  async reloadCache() {
    await this.errorMessageService.reloadCache();
    return { message: '에러 메시지 캐시가 갱신되었습니다.' };
  }
}
