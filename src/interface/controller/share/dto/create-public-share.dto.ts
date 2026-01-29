import {
  IsNotEmpty,
  IsUUID,
  IsArray,
  IsEnum,
  IsOptional,
  IsInt,
  IsDateString,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SharePermission } from '../../../../domain/external-share/type/public-share.type';

/**
 * 공유 권한 열거형
 */
export enum SharePermissionEnum {
  VIEW = 'VIEW',
  DOWNLOAD = 'DOWNLOAD',
}
import type { CreatePublicShareDto } from '../../../../business/external-share/public-share-management.service';

/**
 * 외부 공유 생성 요청 DTO
 */
export class CreatePublicShareRequestDto {
  @ApiProperty({
    description: '공유할 파일 ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID('4', { message: '올바른 파일 ID 형식이 아닙니다.' })
  @IsNotEmpty({ message: '파일 ID를 입력해주세요.' })
  fileId: string;

  @ApiProperty({
    description: '공유 대상 외부 사용자 ID',
    example: '550e8400-e29b-41d4-a716-446655440002',
    format: 'uuid',
  })
  @IsUUID('4', { message: '올바른 외부 사용자 ID 형식이 아닙니다.' })
  @IsNotEmpty({ message: '외부 사용자 ID를 입력해주세요.' })
  externalUserId: string;

  @ApiProperty({
    description: '부여할 권한 목록',
    example: ['VIEW', 'DOWNLOAD'],
    enum: SharePermissionEnum,
    isArray: true,
  })
  @IsArray({ message: '권한은 배열 형식이어야 합니다.' })
  @ArrayMinSize(1, { message: '최소 1개 이상의 권한을 선택해야 합니다.' })
  @IsEnum(SharePermissionEnum, { each: true, message: '올바른 권한 값이 아닙니다. (VIEW, DOWNLOAD)' })
  permissions: SharePermissionEnum[];

  @ApiProperty({
    description: '최대 뷰 횟수 (미설정 시 무제한)',
    example: 10,
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @IsInt({ message: '최대 뷰 횟수는 정수여야 합니다.' })
  @Min(1, { message: '최대 뷰 횟수는 1 이상이어야 합니다.' })
  maxViewCount?: number;

  @ApiProperty({
    description: '최대 다운로드 횟수 (미설정 시 무제한)',
    example: 5,
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @IsInt({ message: '최대 다운로드 횟수는 정수여야 합니다.' })
  @Min(1, { message: '최대 다운로드 횟수는 1 이상이어야 합니다.' })
  maxDownloadCount?: number;

  @ApiProperty({
    description: '만료일시 (미설정 시 무기한)',
    example: '2026-02-28T23:59:59.000Z',
    required: false,
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString({}, { message: '올바른 날짜 형식이 아닙니다. (ISO 8601)' })
  expiresAt?: string;

  /**
   * Request DTO를 서비스 레이어에서 사용하는 DTO로 변환
   * - expiresAt: string → Date 변환
   * - permissions: enum → SharePermission 타입 변환
   */
  toServiceDto(): CreatePublicShareDto {
    return {
      fileId: this.fileId,
      externalUserId: this.externalUserId,
      permissions: this.permissions as unknown as SharePermission[],
      maxViewCount: this.maxViewCount,
      maxDownloadCount: this.maxDownloadCount,
      expiresAt: this.expiresAt ? new Date(this.expiresAt) : undefined,
    };
  }
}

