import { MoodleTokenRepository } from './moodle-token.repository';
import { MoodleToken } from '../entities/moodle-token.entity';
import { User } from '../entities/user.entity';
import type { MoodleTokenResponse } from '../modules/moodle/lib/moodle.types';

// Repo-level unit test exercising the unique-constraint-safe upsert.
// Mocks the protected `findOne`/`create` surface MikroORM's EntityRepository
// exposes so we can verify the lookup key + mutation behaviour without a DB.
describe('MoodleTokenRepository.UpsertFromMoodle', () => {
  const buildUser = (overrides: Partial<User> = {}): User =>
    ({
      id: 'user-uuid-current',
      moodleUserId: 5,
      ...overrides,
    }) as User;

  const buildTokenResponse = (token: string): MoodleTokenResponse =>
    ({ token }) as MoodleTokenResponse;

  const buildRepo = (
    findOneResult: MoodleToken | null,
  ): {
    repo: MoodleTokenRepository;
    findOne: jest.Mock;
    create: jest.Mock;
  } => {
    const findOne = jest.fn().mockResolvedValue(findOneResult);
    const create = jest.fn((data: Partial<MoodleToken>) => data as MoodleToken);
    const repo = Object.create(
      MoodleTokenRepository.prototype,
    ) as MoodleTokenRepository;
    Object.assign(repo, { findOne, create });
    return { repo, findOne, create };
  };

  it('throws when the user has no moodleUserId (defensive precondition)', async () => {
    const { repo } = buildRepo(null);
    const user = buildUser({ moodleUserId: undefined });

    await expect(
      repo.UpsertFromMoodle(user, buildTokenResponse('abc')),
    ).rejects.toThrow(/moodleUserId/);
  });

  it('looks up by moodleUserId (not user.id) and includes soft-deleted rows', async () => {
    const { repo, findOne } = buildRepo(null);
    const user = buildUser();

    await repo.UpsertFromMoodle(user, buildTokenResponse('abc'));

    expect(findOne).toHaveBeenCalledWith(
      { moodleUserId: 5 },
      { filters: { softDelete: false } },
    );
  });

  it('creates a new row when no token exists for this moodleUserId', async () => {
    const { repo, create } = buildRepo(null);
    const user = buildUser();

    const result = await repo.UpsertFromMoodle(
      user,
      buildTokenResponse('new-token'),
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.token).toBe('new-token');
    expect(result.moodleUserId).toBe(5);
    expect(result.user).toBe(user);
  });

  it('mutates in place when the same token is re-presented (validation refresh)', async () => {
    const existing = {
      id: 'token-uuid',
      token: 'same-token',
      moodleUserId: 5,
      isValid: true,
      lastValidatedAt: new Date('2026-01-01T00:00:00Z'),
      invalidatedAt: new Date('2026-01-02T00:00:00Z'),
      user: { id: 'user-uuid-current' } as User,
      deletedAt: undefined,
    } as MoodleToken;
    const { repo, create } = buildRepo(existing);
    const user = buildUser();

    const result = await repo.UpsertFromMoodle(
      user,
      buildTokenResponse('same-token'),
    );

    expect(create).not.toHaveBeenCalled();
    expect(result).toBe(existing);
    expect(result.token).toBe('same-token');
    expect(result.isValid).toBe(true);
    expect(result.invalidatedAt).toBeUndefined();
    expect(result.lastValidatedAt!.getTime()).toBeGreaterThan(
      new Date('2026-01-01T00:00:00Z').getTime(),
    );
  });

  it('mutates in place on a rotated token (FAC fix: previously created a duplicate row)', async () => {
    const existing = {
      id: 'token-uuid',
      token: 'old-token',
      moodleUserId: 5,
      isValid: true,
      lastValidatedAt: new Date('2026-01-01T00:00:00Z'),
      user: { id: 'previous-user-uuid' } as User, // intentionally different
      deletedAt: undefined,
    } as MoodleToken;
    const { repo, create } = buildRepo(existing);
    const user = buildUser({ id: 'user-uuid-current' });

    const result = await repo.UpsertFromMoodle(
      user,
      buildTokenResponse('new-rotated-token'),
    );

    // Critical: no second row created — the unique constraint on moodleUserId
    // would have rejected it. We update the existing row instead.
    expect(create).not.toHaveBeenCalled();
    expect(result).toBe(existing);
    expect(result.token).toBe('new-rotated-token');
    expect(result.isValid).toBe(true);
    expect(result.invalidatedAt).toBeUndefined();
    // Also rebinds to the current local user so the FK stays consistent
    // when the local row was re-created with a fresh UUID.
    expect(result.user).toBe(user);
  });

  it('revives a soft-deleted token instead of creating a duplicate', async () => {
    const softDeleted = {
      id: 'token-uuid',
      token: 'old-token',
      moodleUserId: 5,
      isValid: false,
      user: { id: 'user-uuid-current' } as User,
      deletedAt: new Date('2025-12-01T00:00:00Z'),
    } as MoodleToken;
    const { repo, create } = buildRepo(softDeleted);
    const user = buildUser();

    const result = await repo.UpsertFromMoodle(
      user,
      buildTokenResponse('fresh-token'),
    );

    expect(create).not.toHaveBeenCalled();
    expect(result).toBe(softDeleted);
    expect(result.token).toBe('fresh-token');
    expect(result.isValid).toBe(true);
    expect(result.deletedAt).toBeUndefined();
  });
});
