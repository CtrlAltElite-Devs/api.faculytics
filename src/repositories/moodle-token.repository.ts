import { EntityRepository } from '@mikro-orm/postgresql';
import { MoodleToken } from '../entities/moodle-token.entity';
import { MoodleTokenResponse } from '../modules/moodle/lib/moodle.types';
import { User } from '../entities/user.entity';

export class MoodleTokenRepository extends EntityRepository<MoodleToken> {
  /**
   * Upserts the Moodle token for a user. `moodle_token.moodle_user_id` carries
   * a column-level UNIQUE constraint, so at most one row exists per Moodle
   * user. Look up by `moodleUserId` (the unique key) — not `user.id` — so the
   * lookup survives:
   *
   *   1. Rotated tokens. Moodle issues a new token string on the next login;
   *      we mutate the existing row in place rather than insert a duplicate
   *      with the same `moodleUserId` (the previous implementation did the
   *      latter and tripped the unique constraint).
   *   2. Soft-deleted rows. Postgres enforces UNIQUE on every row, so a
   *      soft-deleted token still blocks an insert. Including soft-deleted
   *      rows in the find lets us revive the existing row instead.
   *   3. Re-created local User. If the local `user` row was rebuilt with a
   *      fresh UUID, the old token's `user_id` FK no longer matches the
   *      current user — but `moodleUserId` still does.
   */
  async UpsertFromMoodle(user: User, moodleTokens: MoodleTokenResponse) {
    if (!user.moodleUserId) {
      throw new Error(
        'Cannot upsert MoodleToken for user without moodleUserId',
      );
    }

    const existing = await this.findOne(
      { moodleUserId: user.moodleUserId },
      { filters: { softDelete: false } },
    );

    if (existing === null) {
      return this.create(MoodleToken.Create(user, moodleTokens));
    }

    existing.user = user;
    existing.token = moodleTokens.token;
    existing.lastValidatedAt = new Date();
    existing.invalidatedAt = undefined;
    existing.isValid = true;
    existing.deletedAt = undefined;

    return existing;
  }
}
