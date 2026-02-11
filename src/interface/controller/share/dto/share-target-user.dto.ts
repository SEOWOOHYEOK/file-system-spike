import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 공유 대상 사용자 유형
 */
export enum ShareTargetUserType {
  INTERNAL = 'INTERNAL',
  EXTERNAL = 'EXTERNAL',
}

/**
 * 공유 대상자 검색 Query DTO
 *
 * GET /v1/file-shares/users 에서 사용
 * 내부/외부 사용자를 통합 검색하기 위한 필터
 */
export class ShareTargetUserQueryDto {
  @ApiPropertyOptional({
    description: '사용자 유형 (미지정 시 전체)',
    enum: ShareTargetUserType,
    example: 'INTERNAL',
  })
  @IsOptional()
  @IsEnum(ShareTargetUserType)
  type?: ShareTargetUserType;

  @ApiPropertyOptional({
    description: '이름 (부분 일치)',
    example: '홍길동',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: '부서명 (부분 일치)',
    example: '개발',
  })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({
    description: '이메일 (부분 일치)',
    example: 'hong@example.com',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    description: '페이지 번호',
    example: 1,
    required: false,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({
    description: '페이지 크기',
    example: 20,
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

/**
 * 공유 대상자 응답 DTO
 *
 * 내부/외부 사용자를 통합된 형태로 반환
 */
export class ShareTargetUserDto {
  @ApiProperty({ description: '사용자 ID', format: 'uuid' })
  id: string;

  @ApiProperty({
    description: '사용자 유형',
    enum: ShareTargetUserType,
    example: 'INTERNAL',
  })
  type: ShareTargetUserType;

  @ApiProperty({ description: '이름', example: '홍길동' })
  name: string;

  @ApiProperty({ description: '이메일', example: 'hong@example.com' })
  email: string;

  @ApiProperty({ description: '부서명', example: '개발팀' })
  department: string;

  @ApiProperty({
    description: 'Role 이름 (미부여 시 null)',
    example: 'ADMIN',
    nullable: true,
  })
  roleName: string | null;

  @ApiProperty({ description: '활성 상태', example: true })
  isActive: boolean;
}
