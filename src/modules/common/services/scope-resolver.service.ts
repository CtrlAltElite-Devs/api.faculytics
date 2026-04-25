import { ForbiddenException, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { UserRole } from 'src/modules/auth/roles.enum';
import { UserInstitutionalRole } from 'src/entities/user-institutional-role.entity';
import { MoodleCategory } from 'src/entities/moodle-category.entity';
import { Department } from 'src/entities/department.entity';
import { Program } from 'src/entities/program.entity';
import { Campus } from 'src/entities/campus.entity';
import { Semester } from 'src/entities/semester.entity';
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

    if (user.roles.includes(UserRole.CAMPUS_HEAD)) {
      return this.resolveCampusHeadDepartmentIds(user.id, semesterId);
    }

    throw new ForbiddenException(
      'User does not have a role with scope access.',
    );
  }

  /**
   * Resolves program IDs the user is allowed to access for a given semester.
   * Returns `null` for unrestricted access (super admin, dean, campus head),
   * or `string[]` of program UUIDs.
   */
  async ResolveProgramIds(semesterId: string): Promise<string[] | null> {
    const user = this.currentUserService.getOrFail();

    if (user.roles.includes(UserRole.SUPER_ADMIN)) {
      return null;
    }

    if (user.roles.includes(UserRole.DEAN)) {
      return null; // Deans see all programs in their departments
    }

    if (user.roles.includes(UserRole.CAMPUS_HEAD)) {
      // Campus Head is unrestricted at program level — the department-level
      // filter in ResolveDepartmentIds is the true scope boundary.
      return null;
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
   * Returns `null` for unrestricted access (super admin, dean, campus head),
   * or `string[]` of program codes.
   */
  async ResolveProgramCodes(semesterId: string): Promise<string[] | null> {
    const user = this.currentUserService.getOrFail();

    if (user.roles.includes(UserRole.SUPER_ADMIN)) {
      return null;
    }

    if (user.roles.includes(UserRole.DEAN)) {
      return null;
    }

    if (user.roles.includes(UserRole.CAMPUS_HEAD)) {
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

  /**
   * Resolves campus IDs the user is allowed to access for a given semester.
   * Returns `null` for unrestricted access (super admin, dean, chairperson —
   * these roles operate at department/program axes and are unrestricted at the
   * campus level), `[]` when a campus-scoped role has no matching campus, or
   * `string[]` of campus UUIDs the user is campus head of.
   *
   * Note: FACULTY and STUDENT hit the terminal `throw` — matches the behavior
   * of `ResolveDepartmentIds` / `ResolveProgramIds`. Callers must route by
   * role before invoking this resolver for those roles.
   */
  async ResolveCampusIds(semesterId: string): Promise<string[] | null> {
    const user = this.currentUserService.getOrFail();

    if (user.roles.includes(UserRole.SUPER_ADMIN)) {
      return null;
    }

    if (
      user.roles.includes(UserRole.DEAN) ||
      user.roles.includes(UserRole.CHAIRPERSON)
    ) {
      return null;
    }

    if (user.roles.includes(UserRole.CAMPUS_HEAD)) {
      return this.resolveCampusHeadCampusIds(user.id, semesterId);
    }

    throw new ForbiddenException(
      'User does not have a role with scope access.',
    );
  }

  /**
   * Returns true iff the faculty has at least one active TEACHER /
   * EDITING_TEACHER enrollment in a course whose owning Department belongs to
   * `semesterId` AND is contained in `allowedDepartmentIds`.
   *
   * `allowedDepartmentIds === null` means unrestricted (super-admin) — always
   * true. Empty array = caller has no scope for this semester — always false.
   *
   * Why: `Department` is per-semester, but `User.department` is single-valued
   * and points to the user's enrollment-majority semester. Comparing
   * `User.department.id` against `ResolveDepartmentIds(otherSemesterId)`
   * silently excludes carryover faculty. Use this enrollment-driven check at
   * every "is faculty X in scope for semester Y?" guard.
   */
  async IsFacultyInSemesterScope(
    facultyId: string,
    semesterId: string,
    allowedDepartmentIds: string[] | null,
  ): Promise<boolean> {
    if (allowedDepartmentIds === null) return true;
    if (allowedDepartmentIds.length === 0) return false;

    const placeholders = allowedDepartmentIds.map(() => '?').join(', ');
    const rows: { hit: number }[] = await this.em.execute(
      `SELECT 1 AS hit
         FROM enrollment e
         INNER JOIN course c ON c.id = e.course_id
         INNER JOIN program p ON p.id = c.program_id
         INNER JOIN department d ON d.id = p.department_id
        WHERE e.user_id = ?
          AND e.role IN ('editingteacher', 'teacher')
          AND e.is_active = true
          AND e.deleted_at IS NULL
          AND c.is_active = true
          AND c.deleted_at IS NULL
          AND p.deleted_at IS NULL
          AND d.deleted_at IS NULL
          AND d.semester_id = ?
          AND d.id IN (${placeholders})
        LIMIT 1`,
      [facultyId, semesterId, ...allowedDepartmentIds],
    );
    return rows.length > 0;
  }

  private async resolveCampusHeadCampusIds(
    userId: string,
    semesterId: string,
  ): Promise<string[]> {
    const roles = await this.em.find(
      UserInstitutionalRole,
      { user: userId, role: UserRole.CAMPUS_HEAD as string },
      { populate: ['moodleCategory'] },
    );
    if (roles.length === 0) return [];

    const promotedCategoryIds = roles
      .map((r) => r.moodleCategory?.moodleCategoryId)
      .filter((id): id is number => id != null);

    if (promotedCategoryIds.length === 0) return [];

    // Restrict to campuses that actually host the given semester — prevents a
    // CAMPUS_HEAD from triggering pipelines on a semester outside their campus
    // even if they're head of multiple campuses.
    const semester = await this.em.findOne(
      Semester,
      { id: semesterId },
      { populate: ['campus'] },
    );
    if (!semester?.campus?.moodleCategoryId) return [];
    if (!promotedCategoryIds.includes(semester.campus.moodleCategoryId)) {
      return [];
    }

    const campuses = await this.em.find(Campus, {
      moodleCategoryId: { $in: promotedCategoryIds },
      id: semester.campus.id,
    });

    return campuses.map((c) => c.id);
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

  private async resolveCampusHeadDepartmentIds(
    userId: string,
    semesterId: string,
  ): Promise<string[]> {
    const roles = await this.em.find(
      UserInstitutionalRole,
      { user: userId, role: UserRole.CAMPUS_HEAD as string },
      { populate: ['moodleCategory'] },
    );
    if (roles.length === 0) return [];

    const promotedCategoryIds = new Set(
      roles
        .map((r) => r.moodleCategory?.moodleCategoryId)
        .filter((id): id is number => id != null),
    );

    const semester = await this.em.findOne(
      Semester,
      { id: semesterId },
      { populate: ['campus'] },
    );
    if (!semester?.campus?.moodleCategoryId) return [];

    if (!promotedCategoryIds.has(semester.campus.moodleCategoryId)) {
      return [];
    }

    const departments = await this.em.find(Department, {
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
