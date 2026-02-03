import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsUUID, IsOptional } from 'class-validator';

/**
 * 즐겨찾기 대상 타입
 */
export enum FavoriteTargetTypeDto {
  FILE = 'FILE',
  FOLDER = 'FOLDER',
}

/**
 * 즐겨찾기 등록 요청 DTO
 */
export class AddFavoriteRequestDto {
  @ApiProperty({
    description: '대상 타입',
    enum: FavoriteTargetTypeDto,
    example: 'FOLDER',
  })
  @IsEnum(FavoriteTargetTypeDto)
  targetType: FavoriteTargetTypeDto;

  @ApiProperty({
    description: '대상 ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  targetId: string;
}

/**
 * 즐겨찾기 목록 조회 쿼리 DTO
 */
export class GetFavoritesQueryDto {
  @ApiPropertyOptional({
    description: '대상 타입 필터',
    enum: FavoriteTargetTypeDto,
  })
  @IsOptional()
  @IsEnum(FavoriteTargetTypeDto)
  type?: FavoriteTargetTypeDto;
}

/**
 * 즐겨찾기 응답 DTO
 */
export class FavoriteResponseDto {
  @ApiProperty({ description: '즐겨찾기 ID' })
  id: string;

  @ApiProperty({ description: '대상 타입', enum: FavoriteTargetTypeDto })
  targetType: string;

  @ApiProperty({ description: '대상 ID' })
  targetId: string;

  @ApiProperty({ description: '등록 시각' })
  createdAt: Date;
}
