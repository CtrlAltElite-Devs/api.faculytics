import { ForbiddenException, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { UserRole } from 'src/modules/auth/roles.enum';
import { UserInstitutionalRole } from 'src/entities/user-institutional-role.entity';
import { Department } from 'src/entities/department.entity';
import { CurrentUserService } from '../cls/current-user.service';

@Injectable()
export class ScopeResolverService {
  constructor(
    private readonly em: EntityManager,
    private readonly currentUserService: CurrentUserService,
  ) {}

  /**
   * Resolves the department IDs the user is allowed to access for a given semester.
   * Returns `null` for unrestricted access (super admin), or `string[]` of department UUIDs.
   */
  async ResolveDepartmentIds(semesterId: string): Promise<string[] | null> {
    const user = this.currentUserService.getOrFail();
    if (user.roles.includes(UserRole.SUPER_ADMIN)) {
      return null;
    }

    if (user.roles.includes(UserRole.DEAN)) {
      const institutionalRoles = await this.em.find(
        UserInstitutionalRole,
        { user: user.id, role: UserRole.DEAN },
        { populate: ['moodleCategory'] },
      );

      const moodleCategoryIds = institutionalRoles
        .filter((ir) => ir.moodleCategory?.moodleCategoryId != null)
        .map((ir) => ir.moodleCategory.moodleCategoryId);

      if (moodleCategoryIds.length === 0) {
        return [];
      }

      const departments = await this.em.find(Department, {
        moodleCategoryId: { $in: moodleCategoryIds },
        semester: semesterId,
      });

      return departments.map((d) => d.id);
    }

    throw new ForbiddenException(
      'User does not have a role with scope access.',
    );
  }
}
