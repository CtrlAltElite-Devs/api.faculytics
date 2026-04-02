import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/modules/auth/roles.enum';

export class AdminUserScopedRelationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;

  @ApiPropertyOptional()
  name?: string;
}

export class AdminUserItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  fullName: string;

  @ApiPropertyOptional()
  moodleUserId?: number;

  @ApiProperty({ enum: UserRole, isArray: true })
  roles: UserRole[];

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional({ type: AdminUserScopedRelationDto, nullable: true })
  campus: AdminUserScopedRelationDto | null;

  @ApiPropertyOptional({ type: AdminUserScopedRelationDto, nullable: true })
  department: AdminUserScopedRelationDto | null;

  @ApiPropertyOptional({ type: AdminUserScopedRelationDto, nullable: true })
  program: AdminUserScopedRelationDto | null;

  static Map(user: User): AdminUserItemResponseDto {
    return {
      id: user.id,
      userName: user.userName,
      fullName: user.fullName ?? `${user.firstName} ${user.lastName}`.trim(),
      moodleUserId: user.moodleUserId,
      roles: user.roles,
      isActive: user.isActive,
      campus: user.campus
        ? {
            id: user.campus.id,
            code: user.campus.code,
            name: user.campus.name,
          }
        : null,
      department: user.department
        ? {
            id: user.department.id,
            code: user.department.code,
            name: user.department.name,
          }
        : null,
      program: user.program
        ? {
            id: user.program.id,
            code: user.program.code,
            name: user.program.name,
          }
        : null,
    };
  }
}
