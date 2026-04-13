import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from 'src/entities/user.entity';
import { AdminUserScopedRelationDto } from './admin-user-item.response.dto';

export class AdminUserScopeAssignmentResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ type: AdminUserScopedRelationDto, nullable: true })
  department: AdminUserScopedRelationDto | null;

  @ApiPropertyOptional({ type: AdminUserScopedRelationDto, nullable: true })
  program: AdminUserScopedRelationDto | null;

  @ApiProperty({ enum: ['auto', 'manual'] })
  departmentSource: string;

  @ApiProperty({ enum: ['auto', 'manual'] })
  programSource: string;

  static Map(user: User): AdminUserScopeAssignmentResponseDto {
    return {
      id: user.id,
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
      departmentSource: user.departmentSource,
      programSource: user.programSource,
    };
  }
}
