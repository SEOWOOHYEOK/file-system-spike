import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  PublicShareManagementService,
  type CreatePublicShareDto,
} from '../../../business/external-share/public-share-management.service';
import { ExternalUserManagementService } from '../../../business/external-share/external-user-management.service';
import { PaginationParams } from '../../../domain/external-share/repositories/external-user.repository.interface';
import { User } from '../../../common/decorators/user.decorator';

/**
 * 공유 컨트롤러 (내부 사용자용)
 */
@ApiTags('PublicShares')
@Controller('v1/public-shares')
@ApiBearerAuth()
export class PublicShareController {
  constructor(
    private readonly shareService: PublicShareManagementService,
    private readonly userService: ExternalUserManagementService,
  ) {}

  /**
   * 외부 공유 생성
   */
  @Post()
  @ApiOperation({ summary: '외부 공유 생성' })
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
  @ApiOperation({ summary: '내가 생성한 공유 목록' })
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
  @ApiOperation({ summary: '공유 상세 조회' })
  async getPublicShareById(@Param('id', ParseUUIDPipe) id: string) {
    return this.shareService.getPublicShareById(id);
  }

  /**
   * 공유 취소 (revoke)
   */
  @Delete(':id')
  @ApiOperation({ summary: '공유 취소' })
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
@ApiTags('external-users')
@Controller('v1/external-users')
@ApiBearerAuth()
export class ExternalUsersController {
  constructor(
    private readonly userService: ExternalUserManagementService,
  ) {}

  /**
   * 공유 가능한 외부 사용자 목록
   */
  @Get()
  @ApiOperation({ summary: '공유 가능한 외부 사용자 목록' })
  async getExternalUsers(
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
  ) {
    const pagination: PaginationParams = { page, pageSize };
    // 활성 사용자만 반환
    return this.userService.getExternalUsers(pagination);
  }
}
