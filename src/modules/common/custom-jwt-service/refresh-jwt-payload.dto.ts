export class RefreshJwtPayload {
  sub: string;
  jti: string;

  static Create(userId: string, refreshTokenId: string): RefreshJwtPayload {
    return {
      sub: userId,
      jti: refreshTokenId,
    };
  }
}
