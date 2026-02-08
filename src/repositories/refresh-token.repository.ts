import { EntityRepository } from '@mikro-orm/postgresql';
import { RefreshToken } from 'src/entities/refresh-token.entity';

export class RefreshTokenRepository extends EntityRepository<RefreshToken> {
  async revokeActiveForDevice(
    userId: string,
    browserName: string,
    os: string,
    ipAddress: string,
  ) {
    await this.em.nativeUpdate(
      RefreshToken,
      {
        userId,
        browserName,
        ipAddress,
        os,
        isActive: true,
      },
      {
        isActive: false,
        revokedAt: new Date(),
      },
    );
  }

  async revokeAllForUser(userId: string) {
    await this.em.nativeUpdate(
      RefreshToken,
      {
        userId,
        isActive: true,
      },
      {
        isActive: false,
        revokedAt: new Date(),
      },
    );
  }
}
