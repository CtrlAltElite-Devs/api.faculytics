import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { MoodleLoginStrategy } from './moodle-login.strategy';
import { MoodleService } from 'src/modules/moodle/moodle.service';
import { MoodleSyncService } from 'src/modules/moodle/services/moodle-sync.service';
import { MoodleUserHydrationService } from 'src/modules/moodle/services/moodle-user-hydration.service';
import { MoodleConnectivityError } from 'src/modules/moodle/lib/moodle.client';
import { User } from 'src/entities/user.entity';

describe('MoodleLoginStrategy', () => {
  let strategy: MoodleLoginStrategy;
  let moodleService: jest.Mocked<MoodleService>;
  let moodleSyncService: jest.Mocked<MoodleSyncService>;
  let moodleUserHydrationService: jest.Mocked<MoodleUserHydrationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoodleLoginStrategy,
        {
          provide: MoodleService,
          useValue: {
            Login: jest.fn(),
          },
        },
        {
          provide: MoodleSyncService,
          useValue: {
            SyncUserContext: jest.fn(),
          },
        },
        {
          provide: MoodleUserHydrationService,
          useValue: {
            hydrateUserCourses: jest.fn(),
          },
        },
      ],
    }).compile();

    strategy = module.get<MoodleLoginStrategy>(MoodleLoginStrategy);
    moodleService = module.get(MoodleService);
    moodleSyncService = module.get(MoodleSyncService);
    moodleUserHydrationService = module.get(MoodleUserHydrationService);
  });

  it('should have priority 100 (external provider)', () => {
    expect(strategy.priority).toBe(100);
  });

  describe('CanHandle', () => {
    it('should return true when user is null', () => {
      const result = strategy.CanHandle(null, {
        username: 'test',
        password: 'pass',
      });

      expect(result).toBe(true);
    });

    it('should return true when user has no password', () => {
      const user = new User();
      user.password = null;

      const result = strategy.CanHandle(user, {
        username: 'test',
        password: 'pass',
      });

      expect(result).toBe(true);
    });

    it('should return false when user has a password', () => {
      const user = new User();
      user.password = 'hashed-password';

      const result = strategy.CanHandle(user, {
        username: 'test',
        password: 'pass',
      });

      expect(result).toBe(false);
    });
  });

  describe('Execute', () => {
    const mockEm = {
      getRepository: jest.fn().mockReturnValue({
        UpsertFromMoodle: jest.fn(),
      }),
    } as unknown as EntityManager;

    it('should return user and moodle token on successful login', async () => {
      const mockUser = new User();
      mockUser.id = 'user-id';
      mockUser.moodleUserId = 123;

      moodleService.Login.mockResolvedValue({ token: 'moodle-token' });
      moodleSyncService.SyncUserContext.mockResolvedValue(mockUser);

      const result = await strategy.Execute(mockEm, null, {
        username: 'moodleuser',
        password: 'moodlepassword',
      });

      expect(result.user).toBe(mockUser);
      expect(result.moodleToken).toBe('moodle-token');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(moodleService.Login).toHaveBeenCalledWith({
        username: 'moodleuser',
        password: 'moodlepassword',
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(moodleSyncService.SyncUserContext).toHaveBeenCalledWith(
        'moodle-token',
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(
        moodleUserHydrationService.hydrateUserCourses,
      ).toHaveBeenCalledWith(123, 'moodle-token');
    });

    it('should throw UnauthorizedException when Moodle connectivity fails', async () => {
      moodleService.Login.mockRejectedValue(
        new MoodleConnectivityError('Failed to connect'),
      );

      await expect(
        strategy.Execute(mockEm, null, {
          username: 'moodleuser',
          password: 'moodlepassword',
        }),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Moodle service is currently unreachable. Please try again later.',
        ),
      );
    });

    it('should throw UnauthorizedException when Moodle connectivity fails during hydration', async () => {
      const mockUser = new User();
      mockUser.id = 'user-id';
      mockUser.moodleUserId = 123;

      moodleService.Login.mockResolvedValue({ token: 'moodle-token' });
      moodleSyncService.SyncUserContext.mockResolvedValue(mockUser);
      moodleUserHydrationService.hydrateUserCourses.mockRejectedValue(
        new MoodleConnectivityError('Failed during hydration'),
      );

      await expect(
        strategy.Execute(mockEm, null, {
          username: 'moodleuser',
          password: 'moodlepassword',
        }),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Moodle service is currently unreachable. Please try again later.',
        ),
      );
    });

    it('should rethrow non-connectivity errors', async () => {
      moodleService.Login.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      await expect(
        strategy.Execute(mockEm, null, {
          username: 'moodleuser',
          password: 'moodlepassword',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('should skip hydration when user has no moodleUserId', async () => {
      const mockUser = new User();
      mockUser.id = 'user-id';
      mockUser.moodleUserId = null;

      moodleService.Login.mockResolvedValue({ token: 'moodle-token' });
      moodleSyncService.SyncUserContext.mockResolvedValue(mockUser);

      await strategy.Execute(mockEm, null, {
        username: 'moodleuser',
        password: 'moodlepassword',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(
        moodleUserHydrationService.hydrateUserCourses,
      ).not.toHaveBeenCalled();
    });
  });
});
