import { Entity, Property } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { RequestMetadata } from 'src/modules/common/interceptors/http/enriched-request';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';

@Entity({ repository: () => RefreshTokenRepository })
export class RefreshToken extends CustomBaseEntity {
  @Property()
  tokenHash: string;

  @Property()
  userId: string;

  @Property()
  expiresAt: Date;

  @Property({ nullable: true })
  revokedAt?: Date;

  @Property({ nullable: true })
  replacedByTokenId?: string;

  @Property()
  isActive: boolean;

  @Property()
  browserName: string;

  @Property()
  os: string;

  @Property()
  ipAddress: string;

  static Create(
    hashedToken: string,
    userId: string,
    metaData: RequestMetadata,
    refreshId: string,
  ) {
    const newRefreshToken = new RefreshToken();
    newRefreshToken.id = refreshId;
    newRefreshToken.tokenHash = hashedToken;
    newRefreshToken.userId = userId;
    newRefreshToken.expiresAt = RefreshToken.addDays(new Date(), 30);
    newRefreshToken.isActive = true;
    newRefreshToken.browserName = metaData.browserName;
    newRefreshToken.os = metaData.os;
    newRefreshToken.ipAddress = metaData.ipAddress;
    return newRefreshToken;
  }

  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
