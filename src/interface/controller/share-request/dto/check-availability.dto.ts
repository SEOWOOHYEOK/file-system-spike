import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsUUID,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ShareTargetType } from '../../../../domain/share-request/type/share-target.type';
import { ShareTargetDto } from './create-share-request.dto';

/**
 * 가용성 확인 요청 DTO
 */
export class CheckAvailabilityDto {
  @ApiProperty({
    description: '확인할 파일 ID 목록',
    example: ['550e8400-e29b-41d4-a716-446655440001'],
    type: [String],
  })
  @IsArray({ message: '파일 ID는 배열 형식이어야 합니다.' })
  @ArrayMinSize(1, { message: '최소 1개 이상의 파일을 선택해야 합니다.' })
  @IsUUID('4', { each: true, message: '올바른 파일 ID 형식이 아닙니다.' })
  fileIds: string[];

  @ApiProperty({
    description: '확인할 공유 대상 목록',
    type: [ShareTargetDto],
  })
  @IsArray({ message: '공유 대상은 배열 형식이어야 합니다.' })
  @ArrayMinSize(1, { message: '최소 1개 이상의 공유 대상을 선택해야 합니다.' })
  @ValidateNested({ each: true })
  @Type(() => ShareTargetDto)
  targets: ShareTargetDto[];
}
