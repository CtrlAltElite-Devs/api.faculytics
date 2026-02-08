import { Entity, ManyToOne, Property, type Rel } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { User } from './user.entity';
import { MoodleTokenResponse } from '../modules/moodle/lib/moodle.types';
import { MoodleTokenRepository } from '../repositories/moodle-token.repository';

@Entity({ repository: () => MoodleTokenRepository })
export class MoodleToken extends CustomBaseEntity {
  @Property()
  token: string;

  @Property({ unique: true })
  moodleUserId: number;

  @Property({ nullable: true })
  lastValidatedAt?: Date;

  @Property({ nullable: true })
  invalidatedAt?: Date;

  @Property()
  isValid: boolean = true;

  @ManyToOne(() => User)
  user: Rel<User>;

  static Create(user: User, moodleTokens: MoodleTokenResponse) {
    const newMoodleToken = new MoodleToken();
    newMoodleToken.token = moodleTokens.token;
    newMoodleToken.moodleUserId = user.moodleUserId;
    newMoodleToken.lastValidatedAt = new Date();
    newMoodleToken.user = user;

    return newMoodleToken;
  }
}
