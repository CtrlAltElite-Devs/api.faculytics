import { User } from 'src/entities/user.entity';

export class MeResponse {
  id: string;
  userName: string;
  moodleUserId: number;
  firstName: string;
  lastName: string;
  userProfilePicture: string;
  fullName: string;
  roles: string[];

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
    };
  }
}
