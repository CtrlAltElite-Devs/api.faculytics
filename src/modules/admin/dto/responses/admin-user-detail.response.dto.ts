import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Enrollment } from 'src/entities/enrollment.entity';
import { UserInstitutionalRole } from 'src/entities/user-institutional-role.entity';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import { AdminUserScopedRelationDto } from './admin-user-item.response.dto';

class AdminEnrollmentCourseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  shortname: string;

  @ApiProperty()
  fullname: string;
}

class AdminInstitutionalRoleCategoryDto {
  @ApiProperty()
  moodleCategoryId: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  depth: number;
}

export class AdminEnrollmentItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ type: AdminEnrollmentCourseDto })
  course: AdminEnrollmentCourseDto;

  static Map(enrollment: Enrollment): AdminEnrollmentItemDto {
    return {
      id: enrollment.id,
      role: enrollment.role,
      isActive: enrollment.isActive,
      course: {
        id: enrollment.course.id,
        shortname: enrollment.course.shortname,
        fullname: enrollment.course.fullname,
      },
    };
  }
}

export class AdminInstitutionalRoleItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  source: string;

  @ApiProperty({ type: AdminInstitutionalRoleCategoryDto })
  category: AdminInstitutionalRoleCategoryDto;

  static Map(ir: UserInstitutionalRole): AdminInstitutionalRoleItemDto | null {
    if (!ir.moodleCategory) return null;

    return {
      id: ir.id,
      role: ir.role,
      source: ir.source,
      category: {
        moodleCategoryId: ir.moodleCategory.moodleCategoryId,
        name: ir.moodleCategory.name,
        depth: ir.moodleCategory.depth,
      },
    };
  }
}

export class AdminUserDetailResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiPropertyOptional()
  moodleUserId?: number;

  @ApiProperty()
  userProfilePicture: string;

  @ApiProperty({ enum: UserRole, isArray: true })
  roles: UserRole[];

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  lastLoginAt: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ type: AdminUserScopedRelationDto, nullable: true })
  campus: AdminUserScopedRelationDto | null;

  @ApiPropertyOptional({ type: AdminUserScopedRelationDto, nullable: true })
  department: AdminUserScopedRelationDto | null;

  @ApiPropertyOptional({ type: AdminUserScopedRelationDto, nullable: true })
  program: AdminUserScopedRelationDto | null;

  @ApiProperty({ type: [AdminEnrollmentItemDto] })
  enrollments: AdminEnrollmentItemDto[];

  @ApiProperty({ type: [AdminInstitutionalRoleItemDto] })
  institutionalRoles: AdminInstitutionalRoleItemDto[];

  static Map(
    user: User,
    enrollments: Enrollment[],
    institutionalRoles: UserInstitutionalRole[],
  ): AdminUserDetailResponseDto {
    return {
      id: user.id,
      userName: user.userName,
      fullName: user.fullName ?? `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
      moodleUserId: user.moodleUserId,
      userProfilePicture: user.userProfilePicture,
      roles: user.roles,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
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
      enrollments: enrollments.map((e) => AdminEnrollmentItemDto.Map(e)),
      institutionalRoles: institutionalRoles
        .map((ir) => AdminInstitutionalRoleItemDto.Map(ir))
        .filter((dto): dto is AdminInstitutionalRoleItemDto => dto !== null),
    };
  }
}
