import { ForbiddenException } from '@nestjs/common';
import { UserRole } from 'src/modules/auth/roles.enum';
import type { User } from 'src/entities/user.entity';

const ELEVATED_ROLES: readonly UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.DEAN,
  UserRole.CHAIRPERSON,
  UserRole.CAMPUS_HEAD,
];

/**
 * Faculty users may only access analytics scoped to their own facultyId.
 * Users carrying any elevated role (Super Admin / Dean / Chairperson /
 * Campus Head) bypass this check — the controller-level role guard plus
 * department-scope validation already constrain those paths.
 */
export function assertFacultySelfScope(user: User, facultyId: string): void {
  const hasElevated = user.roles.some((role) => ELEVATED_ROLES.includes(role));
  if (hasElevated) return;

  if (user.roles.includes(UserRole.FACULTY) && user.id !== facultyId) {
    throw new ForbiddenException('You may only view your own analytics');
  }
}
