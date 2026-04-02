import { FilterQuery } from '@mikro-orm/core';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  UserInstitutionalRole,
  InstitutionalRoleSource,
} from 'src/entities/user-institutional-role.entity';
import { User } from 'src/entities/user.entity';
import { MoodleCategory } from 'src/entities/moodle-category.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import { AssignInstitutionalRoleDto } from '../dto/requests/assign-institutional-role.request.dto';
import { RemoveInstitutionalRoleDto } from '../dto/requests/remove-institutional-role.request.dto';
import { ListUsersQueryDto } from '../dto/requests/list-users-query.dto';
import { AdminUserItemResponseDto } from '../dto/responses/admin-user-item.response.dto';
import { AdminUserDetailResponseDto } from '../dto/responses/admin-user-detail.response.dto';
import { AdminUserListResponseDto } from '../dto/responses/admin-user-list.response.dto';
import { DeanEligibleCategoryResponseDto } from '../dto/responses/dean-eligible-category.response.dto';

@Injectable()
export class AdminService {
  constructor(private readonly em: EntityManager) {}

  async ListUsers(query: ListUsersQueryDto): Promise<AdminUserListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const [users, totalItems] = await this.em.findAndCount(
      User,
      this.BuildUserFilter(query),
      {
        populate: ['campus', 'department', 'program'],
        limit,
        offset,
        orderBy: { userName: 'ASC', id: 'ASC' },
      },
    );

    return {
      data: users.map((user) => AdminUserItemResponseDto.Map(user)),
      meta: {
        totalItems,
        itemCount: users.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  async GetUserDetail(userId: string): Promise<AdminUserDetailResponseDto> {
    const user = await this.em.findOneOrFail(
      User,
      { id: userId },
      {
        populate: ['campus', 'department', 'program'],
        failHandler: () => new NotFoundException('User not found'),
      },
    );

    const [enrollments, institutionalRoles] = await Promise.all([
      this.em.find(
        Enrollment,
        { user: userId, isActive: true, course: { isActive: true } },
        {
          populate: ['course'],
          orderBy: { timeModified: 'DESC' },
        },
      ),
      this.em.find(
        UserInstitutionalRole,
        { user: userId },
        { populate: ['moodleCategory'] },
      ),
    ]);

    return AdminUserDetailResponseDto.Map(
      user,
      enrollments,
      institutionalRoles,
    );
  }

  async AssignInstitutionalRole(dto: AssignInstitutionalRoleDto) {
    const user = await this.em.findOneOrFail(
      User,
      { id: dto.userId },
      { failHandler: () => new NotFoundException('User not found') },
    );

    let moodleCategory = await this.em.findOneOrFail(
      MoodleCategory,
      { moodleCategoryId: dto.moodleCategoryId },
      { failHandler: () => new NotFoundException('Moodle category not found') },
    );

    // DEAN must be assigned at the department level (depth 3).
    // If a program-level category (depth 4) is provided, auto-resolve to its parent department.
    if (dto.role === UserRole.DEAN) {
      if (moodleCategory.depth === 4) {
        moodleCategory = await this.em.findOneOrFail(
          MoodleCategory,
          { moodleCategoryId: moodleCategory.parentMoodleCategoryId },
          {
            failHandler: () =>
              new NotFoundException('Parent department category not found'),
          },
        );
      }

      if (moodleCategory.depth !== 3) {
        throw new BadRequestException(
          `DEAN role must be assigned to a department-level category (depth 3), got depth ${moodleCategory.depth}`,
        );
      }
    }

    const roleData = this.em.create(
      UserInstitutionalRole,
      {
        user,
        role: dto.role,
        moodleCategory,
        source: InstitutionalRoleSource.MANUAL,
      },
      { managed: false },
    );

    await this.em.upsert(UserInstitutionalRole, roleData, {
      onConflictFields: ['user', 'moodleCategory', 'role'],
      onConflictMergeFields: ['source', 'updatedAt'],
    });

    // Re-derive user roles
    await this.refreshUserRoles(user);

    return {
      message: `Assigned ${dto.role} at category ${moodleCategory.name}`,
    };
  }

  async RemoveInstitutionalRole(dto: RemoveInstitutionalRoleDto) {
    const moodleCategory = await this.em.findOneOrFail(
      MoodleCategory,
      { moodleCategoryId: dto.moodleCategoryId },
      { failHandler: () => new NotFoundException('Moodle category not found') },
    );

    const existing = await this.em.findOne(UserInstitutionalRole, {
      user: dto.userId,
      moodleCategory,
      role: dto.role,
    });

    if (!existing) {
      throw new NotFoundException('Institutional role not found');
    }

    this.em.remove(existing);

    // Re-derive user roles
    const user = await this.em.findOneOrFail(User, { id: dto.userId });
    await this.refreshUserRoles(user);

    await this.em.flush();

    return {
      message: `Removed ${dto.role} at category ${moodleCategory.name}`,
    };
  }

  async GetDeanEligibleCategories(
    userId: string,
  ): Promise<DeanEligibleCategoryResponseDto[]> {
    await this.em.findOneOrFail(
      User,
      { id: userId },
      {
        failHandler: () => new NotFoundException('User not found'),
      },
    );

    const roles = await this.em.find(
      UserInstitutionalRole,
      { user: userId },
      { populate: ['moodleCategory'] },
    );

    // Build DEAN exclusion set
    const deanCategoryIds = new Set(
      roles
        .filter(
          (ir) => ir.role === (UserRole.DEAN as string) && ir.moodleCategory,
        )
        .map((ir) => ir.moodleCategory.moodleCategoryId),
    );

    // Filter explicit CHAIRPERSON candidates, skip null moodleCategory
    const chairpersonRoles = roles.filter(
      (ir) => ir.role === (UserRole.CHAIRPERSON as string) && ir.moodleCategory,
    );

    // Separate depth-3 (direct) and depth-4 (need parent resolution)
    const candidates = new Map<number, MoodleCategory>();
    const parentIdsToFetch = new Set<number>();

    for (const ir of chairpersonRoles) {
      const cat = ir.moodleCategory;
      if (cat.depth === 3) {
        candidates.set(cat.moodleCategoryId, cat);
      } else if (cat.depth === 4) {
        parentIdsToFetch.add(cat.parentMoodleCategoryId);
      }
    }

    // Batch-fetch depth-4 parents, only accept depth-3 (department level)
    if (parentIdsToFetch.size > 0) {
      const parentCategories = await this.em.find(MoodleCategory, {
        moodleCategoryId: { $in: [...parentIdsToFetch] },
        depth: 3,
      });
      for (const parent of parentCategories) {
        candidates.set(parent.moodleCategoryId, parent);
      }
    }

    // Exclude categories where user is already DEAN
    for (const deanCatId of deanCategoryIds) {
      candidates.delete(deanCatId);
    }

    return [...candidates.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((cat) => DeanEligibleCategoryResponseDto.Map(cat));
  }

  private async refreshUserRoles(user: User) {
    const enrollments = await this.em.find(Enrollment, {
      user,
      isActive: true,
    });
    const institutionalRoles = await this.em.find(UserInstitutionalRole, {
      user,
    });

    user.updateRolesFromEnrollments(enrollments, institutionalRoles);
    await this.em.flush();
  }

  private BuildUserFilter(query: ListUsersQueryDto): FilterQuery<User> {
    const filter: FilterQuery<User> = {};

    if (query.search) {
      const search = `%${this.EscapeLikePattern(query.search.trim())}%`;
      filter.$or = [
        { id: { $ilike: search } },
        { userName: { $ilike: search } },
        { fullName: { $ilike: search } },
        { firstName: { $ilike: search } },
        { lastName: { $ilike: search } },
      ];
    }

    if (query.role) {
      filter.roles = { $contains: [query.role] };
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    if (query.campusId) {
      filter.campus = query.campusId;
    }

    if (query.departmentId) {
      filter.department = query.departmentId;
    }

    if (query.programId) {
      filter.program = query.programId;
    }

    return filter;
  }

  private EscapeLikePattern(value: string): string {
    return value.replace(/[%_\\]/g, '\\$&');
  }
}
