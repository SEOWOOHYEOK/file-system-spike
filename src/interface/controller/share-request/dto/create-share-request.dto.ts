import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMinSize,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ShareTargetType } from '../../../../domain/share-request/type/share-target.type';
import { SharePermissionType } from '../../../../domain/share-request/type/share-permission.type';
import type { CreateShareRequestDto as ServiceCreateShareRequestDto } from '../../../../business/share-request/share-request-command.service';

/**
 * 공유 대상 DTO
 */
export class ShareTargetDto {
  @ApiProperty({
    description: '공유 대상 타입',
    enum: ShareTargetType,
    example: ShareTargetType.INTERNAL_USER,
  })
  @IsEnum(ShareTargetType, { message: '올바른 공유 대상 타입이 아닙니다. (INTERNAL_USER, EXTERNAL_USER)' })
  type: ShareTargetType;

  @ApiProperty({
    description: '사용자 ID (내부 또는 외부 사용자 UUID)',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID('4', { message: '올바른 사용자 ID 형식이 아닙니다.' })
  @IsNotEmpty({ message: '사용자 ID를 입력해주세요.' })
  userId: string;
}

/**
 * 권한 DTO
 */
export class PermissionDto {
  @ApiProperty({
    description: '권한 타입',
    enum: SharePermissionType,
    example: SharePermissionType.VIEW,
  })
  @IsEnum(SharePermissionType, { message: '올바른 권한 타입이 아닙니다. (VIEW, DOWNLOAD)' })
  type: SharePermissionType;

  @ApiProperty({
    description: '최대 다운로드 횟수 (DOWNLOAD 권한일 때만 사용, 선택적)',
    example: 5,
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @IsInt({ message: '최대 다운로드 횟수는 정수여야 합니다.' })
  @Min(1, { message: '최대 다운로드 횟수는 1 이상이어야 합니다.' })
  maxDownloads?: number;
}

/**
 * 공유 요청 생성 요청 DTO
 */
export class CreateShareRequestDto {
  @ApiProperty({
    description: '공유할 파일 ID 목록',
    example: ['550e8400-e29b-41d4-a716-446655440001'],
    type: [String],
  })
  @IsArray({ message: '파일 ID는 배열 형식이어야 합니다.' })
  @ArrayMinSize(1, { message: '최소 1개 이상의 파일을 선택해야 합니다.' })
  @IsUUID('4', { each: true, message: '올바른 파일 ID 형식이 아닙니다.' })
  fileIds: string[];

  @ApiProperty({
    description: '공유 대상 목록',
    type: [ShareTargetDto],
  })
  @IsArray({ message: '공유 대상은 배열 형식이어야 합니다.' })
  @ArrayMinSize(1, { message: '최소 1개 이상의 공유 대상을 선택해야 합니다.' })
  @ValidateNested({ each: true })
  @Type(() => ShareTargetDto)
  targets: ShareTargetDto[];

  @ApiProperty({
    description: '부여할 권한',
    type: PermissionDto,
  })
  @ValidateNested()
  @Type(() => PermissionDto)
  permission: PermissionDto;

  @ApiProperty({
    description: '공유 시작일시',
    example: '2026-02-10T00:00:00.000Z',
    format: 'date-time',
  })
  @IsDateString({}, { message: '올바른 시작일시 형식이 아닙니다. (ISO 8601)' })
  @IsNotEmpty({ message: '시작일시를 입력해주세요.' })
  startAt: string;

  @ApiProperty({
    description: '공유 종료일시',
    example: '2026-02-28T23:59:59.000Z',
    format: 'date-time',
  })
  @IsDateString({}, { message: '올바른 종료일시 형식이 아닙니다. (ISO 8601)' })
  @IsNotEmpty({ message: '종료일시를 입력해주세요.' })
  endAt: string;

  @ApiProperty({
    description: '공유 요청 사유',
    example: '프로젝트 협업을 위한 파일 공유',
  })
  @IsString({ message: '사유는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '사유를 입력해주세요.' })
  reason: string;

  @ApiProperty({
    description: '승인 대상자 ID (매니저 이상 역할 사용자의 UUID)',
    example: '550e8400-e29b-41d4-a716-446655440003',
    format: 'uuid',
  })
  @IsUUID('4', { message: '올바른 승인 대상자 ID 형식이 아닙니다.' })
  @IsNotEmpty({ message: '승인 대상자를 선택해주세요.' })
  designatedApproverId: string;

  /**
   * Request DTO를 서비스 레이어에서 사용하는 DTO로 변환
   * - startAt, endAt: string → Date 변환
   * - targets, permission: DTO → Domain 타입 변환
   */
  toServiceDto(): ServiceCreateShareRequestDto {
    return {
      fileIds: this.fileIds,
      targets: this.targets.map((t) => ({
        type: t.type,
        userId: t.userId,
      })),
      permission: {
        type: this.permission.type,
        maxDownloads: this.permission.maxDownloads,
      },
      startAt: new Date(this.startAt),
      endAt: new Date(this.endAt),
      reason: this.reason,
      designatedApproverId: this.designatedApproverId,
    };
  }
}
