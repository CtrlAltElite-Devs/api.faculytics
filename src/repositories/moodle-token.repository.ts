import { EntityRepository } from '@mikro-orm/postgresql';
import { MoodleToken } from '../entities/moodle-token.entity';
import { User } from '../entities/user.entity';
import { MoodleTokenResponse } from '../modules/moodle/lib/moodle.types';

export class MoodleTokenRepository extends EntityRepository<MoodleToken> {
  async UpsertFromMoodle(user: User, moodleTokens: MoodleTokenResponse) {
    let moodleToken = await this.findOne({
      user: {
        id: user.id,
      },
    });

    if (moodleToken === null) {
      // first token
      moodleToken = this.create(MoodleToken.Create(user, moodleTokens));
    } else if (moodleToken.token === moodleTokens.token) {
      // same token
      moodleToken.lastValidatedAt = new Date();
      moodleToken.invalidatedAt = undefined;
      moodleToken.isValid = true;
    } else {
      // rotated token
      moodleToken.isValid = false;
      moodleToken.invalidatedAt = new Date();
      return this.create(MoodleToken.Create(user, moodleTokens));
    }

    return moodleToken;
  }
}
