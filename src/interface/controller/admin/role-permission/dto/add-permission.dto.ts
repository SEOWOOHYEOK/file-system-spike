import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PermissionEnum } from '../../../../../domain/role/permission.enum';

/**
 * 역할에 권한 추가 요청 DTO
 */
export class AddPermissionDto {
  @ApiProperty({
    description: '추가할 권한 코드',
    enum: PermissionEnum,
    example: PermissionEnum.FILE_READ,
  })
  @IsEnum(PermissionEnum)
  permissionCode: PermissionEnum;
}
