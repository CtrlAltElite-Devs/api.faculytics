import { UnauthorizedException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import * as bcrypt from 'bcrypt';
import { LocalLoginStrategy } from './local-login.strategy';
import { User } from 'src/entities/user.entity';

describe('LocalLoginStrategy', () => {
  let strategy: LocalLoginStrategy;

  beforeEach(() => {
    strategy = new LocalLoginStrategy();
  });

  it('should have priority 10 (core authentication)', () => {
    expect(strategy.priority).toBe(10);
  });

  describe('CanHandle', () => {
    it('should return true when user exists and has a password', () => {
      const user = new User();
      user.password = 'hashed-password';

      const result = strategy.CanHandle(user, {
        username: 'test',
        password: 'pass',
      });

      expect(result).toBe(true);
    });

    it('should return false when user is null', () => {
      const result = strategy.CanHandle(null, {
        username: 'test',
        password: 'pass',
      });

      expect(result).toBe(false);
    });

    it('should return false when user has no password', () => {
      const user = new User();
      user.password = null;

      const result = strategy.CanHandle(user, {
        username: 'test',
        password: 'pass',
      });

      expect(result).toBe(false);
    });
  });

  describe('Execute', () => {
    it('should return user when password is valid', async () => {
      const password = 'password123';
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User();
      user.id = 'user-id';
      user.password = hashedPassword;

      const result = await strategy.Execute({} as EntityManager, user, {
        username: 'test',
        password,
      });

      expect(result.user).toBe(user);
      expect(result.moodleToken).toBeUndefined();
    });

    it('should throw UnauthorizedException when password is invalid', async () => {
      const user = new User();
      user.password = await bcrypt.hash('correct-password', 10);

      await expect(
        strategy.Execute({} as EntityManager, user, {
          username: 'test',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user is null', async () => {
      await expect(
        strategy.Execute({} as EntityManager, null, {
          username: 'test',
          password: 'password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user has no password', async () => {
      const user = new User();
      user.password = null;

      await expect(
        strategy.Execute({} as EntityManager, user, {
          username: 'test',
          password: 'password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
