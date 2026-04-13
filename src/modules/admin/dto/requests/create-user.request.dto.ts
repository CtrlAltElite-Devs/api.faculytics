import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateLocalUserRequestDto {
  @ApiProperty({
    example: 'local-kmartinez',
    description: 'Username — must start with reserved "local-" prefix',
  })
  @IsString()
  @Matches(/^local-[a-z0-9][a-z0-9._-]*$/, {
    message:
      'username must start with "local-" prefix and contain only lowercase alphanumerics, dots, dashes, or underscores',
  })
  username: string;

  @ApiProperty({ example: 'K' })
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiProperty({ example: 'Martinez' })
  @IsString()
  @MinLength(1)
  lastName: string;

  @ApiPropertyOptional({
    description:
      'Password (min 6 chars). Omit to assign default "Head123#" seed.',
  })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'password must be at least 6 characters' })
  password?: string;

  @ApiPropertyOptional({
    description:
      'Optional UUID of the campus to assign. Sets campusSource="manual".',
  })
  @IsOptional()
  @IsUUID()
  campusId?: string;
}
