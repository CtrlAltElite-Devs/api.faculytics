import { User } from './user.entity';
import { UserRole } from '../modules/auth/roles.enum';
import { Enrollment } from './enrollment.entity';
import { UserInstitutionalRole } from './user-institutional-role.entity';

function stubEnrollment(role: string, isActive = true): Enrollment {
  return { role, isActive } as unknown as Enrollment;
}

function stubInstRole(role: string): UserInstitutionalRole {
  return { role } as unknown as UserInstitutionalRole;
}

describe('User.updateRolesFromEnrollments', () => {
  let user: User;

  beforeEach(() => {
    user = new User();
    user.roles = [];
  });

  it('should preserve SUPER_ADMIN alongside enrollment-derived roles', () => {
    user.roles = [UserRole.SUPER_ADMIN];

    user.updateRolesFromEnrollments([stubEnrollment('student')]);

    expect(user.roles).toEqual(
      expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.STUDENT]),
    );
    expect(user.roles).toHaveLength(2);
  });

  it('should preserve ADMIN alongside enrollment-derived roles', () => {
    user.roles = [UserRole.ADMIN];

    user.updateRolesFromEnrollments([stubEnrollment('editingteacher')]);

    expect(user.roles).toEqual(
      expect.arrayContaining([UserRole.ADMIN, UserRole.FACULTY]),
    );
    expect(user.roles).toHaveLength(2);
  });

  it('should derive roles from enrollments without protected roles', () => {
    user.updateRolesFromEnrollments([
      stubEnrollment('student'),
      stubEnrollment('editingteacher'),
    ]);

    expect(user.roles).toEqual(
      expect.arrayContaining([UserRole.STUDENT, UserRole.FACULTY]),
    );
    expect(user.roles).toHaveLength(2);
  });

  it('should keep SUPER_ADMIN when no enrollments and no institutional roles', () => {
    user.roles = [UserRole.SUPER_ADMIN];

    user.updateRolesFromEnrollments([]);

    expect(user.roles).toEqual([UserRole.SUPER_ADMIN]);
  });

  it('should include both enrollment and institutional roles', () => {
    user.updateRolesFromEnrollments(
      [stubEnrollment('teacher')],
      [stubInstRole(UserRole.DEAN)],
    );

    expect(user.roles).toEqual(
      expect.arrayContaining([UserRole.FACULTY, UserRole.DEAN]),
    );
    expect(user.roles).toHaveLength(2);
  });

  it('should map manager enrollment role to DEAN via MoodleRoleMapping', () => {
    user.updateRolesFromEnrollments([stubEnrollment('manager')]);

    expect(user.roles).toEqual(expect.arrayContaining([UserRole.DEAN]));
    expect(user.roles).toHaveLength(1);
  });

  it('should return empty roles when no protected roles, no enrollments, no institutional roles', () => {
    user.updateRolesFromEnrollments([]);

    expect(user.roles).toEqual([]);
  });

  it('should ignore inactive enrollments', () => {
    user.updateRolesFromEnrollments([
      stubEnrollment('student', false),
      stubEnrollment('editingteacher', false),
    ]);

    expect(user.roles).toEqual([]);
  });

  it('should deduplicate roles from multiple enrollments with the same role', () => {
    user.updateRolesFromEnrollments([
      stubEnrollment('student'),
      stubEnrollment('student'),
      stubEnrollment('student'),
    ]);

    expect(user.roles).toEqual([UserRole.STUDENT]);
  });

  it('should fall back to uppercased role string for unknown Moodle roles', () => {
    user.updateRolesFromEnrollments([stubEnrollment('coursecreator')]);

    expect(user.roles).toEqual(['COURSECREATOR']);
  });
});
