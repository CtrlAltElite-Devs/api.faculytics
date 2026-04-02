import { User } from 'src/entities/user.entity';

export class MeResponse {
  id: string;
  userName: string;
  moodleUserId?: number;
  firstName: string;
  lastName: string;
  userProfilePicture: string;
  fullName: string;
  roles: string[];
  campus?: { id: string; name?: string; code: string };
  program?: { id: string; name?: string; code: string };
  department?: { id: string; name?: string; code: string };

  static Map(user: User): MeResponse {
    return {
      id: user.id,
      userName: user.userName,
      moodleUserId: user.moodleUserId,
      firstName: user.firstName,
      lastName: user.lastName,
      userProfilePicture: user.userProfilePicture,
      fullName: user.fullName ?? '',
      roles: user.roles,
      campus: user.campus
        ? { id: user.campus.id, name: user.campus.name, code: user.campus.code }
        : undefined,
      program: user.program
        ? {
            id: user.program.id,
            name: user.program.name,
            code: user.program.code,
          }
        : undefined,
      department: user.department
        ? {
            id: user.department.id,
            name: user.department.name,
            code: user.department.code,
          }
        : undefined,
    };
  }
}
