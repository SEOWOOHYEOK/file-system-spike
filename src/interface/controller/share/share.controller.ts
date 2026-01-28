import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards';
import {
  PublicShareManagementService,
  type CreatePublicShareDto,
} from '../../../business/external-share/public-share-management.service';
import { ExternalUserManagementService } from '../../../business/external-share/external-user-management.service';
import { PaginationParams } from '../../../domain/external-share/repositories/external-user.repository.interface';
import { User } from '../../../common/decorators/user.decorator';
import {
  ApiCreatePublicShare,
  ApiGetMyPublicShares,
  ApiGetPublicShareById,
  ApiRevokeShare,
  ApiGetExternalUsers,
} from './share.swagger';

/**
 * 파일 공유  
 */
@ApiTags('600.외부공유')
@Controller('v1/file-shares')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class PublicShareController {
  constructor(
    private readonly shareService: PublicShareManagementService,
    private readonly userService: ExternalUserManagementService,
  ) { }

  /**
   * 외부 공유 생성
   */
  @Post()
  @ApiCreatePublicShare()
  async createPublicShare(
    @User() user: { id: string },
    @Body() dto: CreatePublicShareDto,
  ) {
    return this.shareService.createPublicShare(user.id, dto);
  }

  /**
   * 내가 생성한 공유 목록 조회
   */
  @Get()
  @ApiGetMyPublicShares()
  async getMyPublicShares(
    @User() user: { id: string },
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    const pagination: PaginationParams = { page, pageSize, sortBy, sortOrder };
    return this.shareService.getMyPublicShares(user.id, pagination);
  }

  /**
   * 공유 상세 조회
   */
  @Get(':id')
  @ApiGetPublicShareById()
  async getPublicShareById(@Param('id', ParseUUIDPipe) id: string) {
    return this.shareService.getPublicShareById(id);
  }

  /**
   * 공유 취소 (revoke)
   */
  @Delete(':id')
  @ApiRevokeShare()
  async revokeShare(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shareService.revokeShare(user.id, id);
  }
}

/**
 * 외부 사용자 목록 컨트롤러 (내부 사용자용)
 */
@ApiTags('600.외부공유')
@Controller('v1/external-users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ExternalUsersController {
  constructor(
    private readonly userService: ExternalUserManagementService,
  ) { }

  /**
   * 공유 가능한 외부 사용자 목록
   */
  @Get()
  @ApiGetExternalUsers()
  async getExternalUsers(
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
  ) {
    const pagination: PaginationParams = { page, pageSize };
    // 활성 사용자만 반환
    return this.userService.getExternalUsers(pagination);
  }
}
