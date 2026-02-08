export class JwtPayload {
  userId: string;
  moodleUserId: number;

  static Create(userId: string, moodleUserId: number): JwtPayload {
    return {
      userId,
      moodleUserId,
    };
  }
}
