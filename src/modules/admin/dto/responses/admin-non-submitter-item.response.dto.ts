import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/modules/auth/roles.enum';

export class AdminNonSubmitterScopedRelationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;

  @ApiPropertyOptional()
  name?: string;
}

export class AdminNonSubmitterItemResponseDto {
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

  @ApiProperty({
    description:
      'Number of active enrollments the student has in courses scoped to the target semester.',
  })
  enrolledCoursesInSemester: number;

  @ApiPropertyOptional({
    type: AdminNonSubmitterScopedRelationDto,
    nullable: true,
  })
  campus: AdminNonSubmitterScopedRelationDto | null;

  @ApiPropertyOptional({
    type: AdminNonSubmitterScopedRelationDto,
    nullable: true,
  })
  department: AdminNonSubmitterScopedRelationDto | null;

  @ApiPropertyOptional({
    type: AdminNonSubmitterScopedRelationDto,
    nullable: true,
  })
  program: AdminNonSubmitterScopedRelationDto | null;

  static Map(
    user: User,
    enrolledCoursesInSemester: number,
  ): AdminNonSubmitterItemResponseDto {
    return {
      id: user.id,
      userName: user.userName,
      fullName: user.fullName ?? `${user.firstName} ${user.lastName}`.trim(),
      moodleUserId: user.moodleUserId,
      roles: user.roles,
      isActive: user.isActive,
      enrolledCoursesInSemester,
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
