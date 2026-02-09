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
import { PublicShareManagementService } from '../../../business/external-share/public-share-management.service';
import { ExternalUserManagementService } from '../../../business/external-share/external-user-management.service';
import { User } from '../../../common/decorators/user.decorator';
import {
  ApiCreatePublicShare,
  ApiGetMyPublicShares,
  ApiGetPublicShareById,
  ApiRevokeShare,
  ApiGetExternalUsers,
} from './share.swagger';
import { CreatePublicShareRequestDto } from './dto/create-public-share.dto';
import {
  PublicShareResponseDto,
  PublicShareListItemDto,
  RevokeShareResponseDto,
} from './dto/public-share-response.dto';
import { ExternalUserListItemDto } from '../admin/external-user/dto/external-user-response.dto';
import { PaginationQueryDto, PaginatedResponseDto } from '../../common/dto';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';

/**
 * 파일 공유  
 */
@ApiTags('600.외부공유')
@Controller('v1/file-shares')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class PublicShareController {
  constructor(
    private readonly shareService: PublicShareManagementService
  ) { }

  /**
   * 외부 공유 생성
   */
  @Post()
  @ApiCreatePublicShare()
  @AuditAction({
    action: AuditActionEnum.SHARE_CREATE,
    targetType: TargetType.SHARE,
    targetIdParam: 'id',
  })
  async createPublicShare(
    @User() user: { id: string },
    @Body() dto: CreatePublicShareRequestDto,
  ): Promise<PublicShareResponseDto> {
    const share = await this.shareService.createPublicShare(user.id, dto.toServiceDto());
    return PublicShareResponseDto.fromEntity(share);
  }

  /**
   * 내가 생성한 공유 목록 조회
   */
  @Get()
  @ApiGetMyPublicShares()
  async getMyPublicShares(
    @User() user: { id: string },
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<PublicShareListItemDto>> {
    return this.shareService.getMyPublicShares(user.id, query);
  }

  /**
   * 공유 상세 조회
   */
  @Get(':id')
  @ApiGetPublicShareById()
  async getPublicShareById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublicShareResponseDto> {
    const share = await this.shareService.getPublicShareById(id);
    return PublicShareResponseDto.fromEntity(share);
  }

  /**
   * 공유 취소 (revoke)
   */
  @Delete(':id')
  @ApiRevokeShare()
  @AuditAction({
    action: AuditActionEnum.SHARE_REVOKE,
    targetType: TargetType.SHARE,
    targetIdParam: 'id',
  })
  async revokeShare(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RevokeShareResponseDto> {
    const share = await this.shareService.revokeShare(user.id, id);
    return RevokeShareResponseDto.fromEntity(share);
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
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<ExternalUserListItemDto>> {
    // 활성 사용자만 반환
    return this.userService.getExternalUsers(query);
  }
}
