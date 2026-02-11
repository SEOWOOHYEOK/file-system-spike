import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray, ArrayNotEmpty } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ description: '역할 이름', example: 'MANAGER' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: '역할 설명', example: '매니저 역할' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: '권한 코드 목록',
    example: ['FILE_READ', 'FILE_WRITE', 'FOLDER_READ'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissionCodes: string[];
}
