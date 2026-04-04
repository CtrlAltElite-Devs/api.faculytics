import { ForbiddenException, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { UserRole } from 'src/modules/auth/roles.enum';
import { UserInstitutionalRole } from 'src/entities/user-institutional-role.entity';
import { MoodleCategory } from 'src/entities/moodle-category.entity';
import { Department } from 'src/entities/department.entity';
import { Program } from 'src/entities/program.entity';
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
      return this.resolveDeanDepartments(user.id, semesterId);
    }

    if (user.roles.includes(UserRole.CHAIRPERSON)) {
      return this.resolveChairpersonDepartments(user.id, semesterId);
    }

    throw new ForbiddenException(
      'User does not have a role with scope access.',
    );
  }

  /**
   * Resolves program IDs the user is allowed to access for a given semester.
   * Returns `null` for unrestricted access (super admin, dean), or `string[]` of program UUIDs.
   */
  async ResolveProgramIds(semesterId: string): Promise<string[] | null> {
    const user = this.currentUserService.getOrFail();

    if (user.roles.includes(UserRole.SUPER_ADMIN)) {
      return null;
    }

    if (user.roles.includes(UserRole.DEAN)) {
      return null; // Deans see all programs in their departments
    }

    if (user.roles.includes(UserRole.CHAIRPERSON)) {
      const programs = await this.resolveChairpersonPrograms(
        user.id,
        semesterId,
      );
      return programs.map((p) => p.id);
    }

    throw new ForbiddenException(
      'User does not have a role with scope access.',
    );
  }

  /**
   * Resolves program codes the user is allowed to access for a given semester.
   * Returns `null` for unrestricted access (super admin, dean), or `string[]` of program codes.
   */
  async ResolveProgramCodes(semesterId: string): Promise<string[] | null> {
    const user = this.currentUserService.getOrFail();

    if (user.roles.includes(UserRole.SUPER_ADMIN)) {
      return null;
    }

    if (user.roles.includes(UserRole.DEAN)) {
      return null;
    }

    if (user.roles.includes(UserRole.CHAIRPERSON)) {
      const programs = await this.resolveChairpersonPrograms(
        user.id,
        semesterId,
      );
      return programs.map((p) => p.code);
    }

    throw new ForbiddenException(
      'User does not have a role with scope access.',
    );
  }

  private async resolveChairpersonPrograms(
    userId: string,
    semesterId: string,
  ): Promise<Program[]> {
    const institutionalRoles = await this.em.find(
      UserInstitutionalRole,
      { user: userId, role: UserRole.CHAIRPERSON },
      { populate: ['moodleCategory'] },
    );

    const programCodes = institutionalRoles
      .filter((ir) => ir.moodleCategory?.name != null)
      .map((ir) => ir.moodleCategory.name);

    if (programCodes.length === 0) return [];

    return this.em.find(Program, {
      code: { $in: programCodes },
      department: { semester: semesterId },
    });
  }

  private async resolveDeanDepartments(
    userId: string,
    semesterId: string,
  ): Promise<string[]> {
    const institutionalRoles = await this.em.find(
      UserInstitutionalRole,
      { user: userId, role: UserRole.DEAN },
      { populate: ['moodleCategory'] },
    );

    if (institutionalRoles.length === 0) {
      return [];
    }

    const directCodes: string[] = [];
    const parentMoodleCategoryIds: number[] = [];

    for (const ir of institutionalRoles) {
      const cat = ir.moodleCategory;
      if (!cat) continue;

      if (cat.depth === 3) {
        directCodes.push(cat.name);
      } else if (cat.depth === 4) {
        parentMoodleCategoryIds.push(cat.parentMoodleCategoryId);
      }
    }

    if (parentMoodleCategoryIds.length > 0) {
      const parentCats = await this.em.find(MoodleCategory, {
        moodleCategoryId: { $in: parentMoodleCategoryIds },
      });
      directCodes.push(...parentCats.map((c) => c.name));
    }

    const departmentCodes = [...new Set(directCodes)];
    if (departmentCodes.length === 0) {
      return [];
    }

    const departments = await this.em.find(Department, {
      code: { $in: departmentCodes },
      semester: semesterId,
    });

    return departments.map((d) => d.id);
  }

  private async resolveChairpersonDepartments(
    userId: string,
    semesterId: string,
  ): Promise<string[]> {
    const institutionalRoles = await this.em.find(
      UserInstitutionalRole,
      { user: userId, role: UserRole.CHAIRPERSON },
      { populate: ['moodleCategory'] },
    );

    const programCodes = institutionalRoles
      .filter((ir) => ir.moodleCategory?.name != null)
      .map((ir) => ir.moodleCategory.name);

    if (programCodes.length === 0) {
      return [];
    }

    // Chairperson has program-level (depth 4) categories — find parent departments
    const programs = await this.em.find(
      Program,
      {
        code: { $in: programCodes },
        department: { semester: semesterId },
      },
      { populate: ['department'] },
    );

    const departmentIds = [...new Set(programs.map((p) => p.department.id))];

    return departmentIds;
  }
}
