import { FilterQuery } from '@mikro-orm/core';
import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  UserInstitutionalRole,
  InstitutionalRoleSource,
} from 'src/entities/user-institutional-role.entity';
import { User } from 'src/entities/user.entity';
import { MoodleCategory } from 'src/entities/moodle-category.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { AssignInstitutionalRoleDto } from '../dto/requests/assign-institutional-role.request.dto';
import { RemoveInstitutionalRoleDto } from '../dto/requests/remove-institutional-role.request.dto';
import { ListUsersQueryDto } from '../dto/requests/list-users-query.dto';
import { AdminUserItemResponseDto } from '../dto/responses/admin-user-item.response.dto';
import { AdminUserListResponseDto } from '../dto/responses/admin-user-list.response.dto';

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

  async AssignInstitutionalRole(dto: AssignInstitutionalRoleDto) {
    const user = await this.em.findOneOrFail(
      User,
      { id: dto.userId },
      { failHandler: () => new NotFoundException('User not found') },
    );

    const moodleCategory = await this.em.findOneOrFail(
      MoodleCategory,
      { moodleCategoryId: dto.moodleCategoryId },
      { failHandler: () => new NotFoundException('Moodle category not found') },
    );

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
