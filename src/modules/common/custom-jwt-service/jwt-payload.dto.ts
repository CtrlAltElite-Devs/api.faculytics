export class JwtPayload {
  sub: string;
  moodleUserId?: number;

  static Create(userId: string, moodleUserId?: number): JwtPayload {
    return {
      sub: userId,
      moodleUserId,
    };
  }
}
