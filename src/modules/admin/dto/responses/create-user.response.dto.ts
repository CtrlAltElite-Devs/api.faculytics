import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from 'src/entities/user.entity';

export class CreateLocalUserCampusDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;
}

export class CreateLocalUserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({
    description: 'Computed server-side as `${firstName} ${lastName}`',
  })
  fullName: string;

  @ApiPropertyOptional({ type: CreateLocalUserCampusDto, nullable: true })
  campus: CreateLocalUserCampusDto | null;

  @ApiProperty({
    description:
      'True when no password was provided and the "Head123#" default was assigned',
  })
  defaultPasswordAssigned: boolean;

  @ApiProperty()
  createdAt: string;

  static FromUser(
    user: User,
    defaultPasswordAssigned: boolean,
  ): CreateLocalUserResponseDto {
    return {
      id: user.id,
      username: user.userName,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName ?? `${user.firstName} ${user.lastName}`.trim(),
      campus: user.campus
        ? { id: user.campus.id, code: user.campus.code }
        : null,
      defaultPasswordAssigned,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
