export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  DEAN = 'DEAN',
  FACULTY = 'FACULTY',
  STUDENT = 'STUDENT',
}

export const MoodleRoleMapping: Record<string, UserRole> = {
  editingteacher: UserRole.FACULTY,
  teacher: UserRole.FACULTY,
  student: UserRole.STUDENT,
  manager: UserRole.DEAN, // Institutional mapping
};
