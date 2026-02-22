import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { MoodleService } from '../moodle/moodle.service';
import { MoodleSyncService } from '../moodle/services/moodle-sync.service';
import { MoodleUserHydrationService } from '../moodle/services/moodle-user-hydration.service';
import { CustomJwtService } from '../common/custom-jwt-service';
import UnitOfWork from '../common/unit-of-work';
import { User } from '../../entities/user.entity';
import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;

  let moodleService: MoodleService;

  let moodleSyncService: MoodleSyncService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let moodleUserHydrationService: MoodleUserHydrationService;

  let jwtService: CustomJwtService;

  let unitOfWork: UnitOfWork;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
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
        {
          provide: CustomJwtService,
          useValue: {
            CreateSignedTokens: jest.fn(),
          },
        },
        {
          provide: UnitOfWork,
          useValue: {
            runInTransaction: jest
              .fn()
              .mockImplementation((cb: (em: any) => any) =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                cb({
                  getRepository: jest.fn().mockReturnValue({
                    UpsertFromMoodle: jest.fn(),
                    revokeAllForUser: jest.fn(),
                  }),
                  findOne: jest.fn(),
                  findOneOrFail: jest.fn(),
                }),
              ),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    moodleService = module.get<MoodleService>(MoodleService);
    moodleSyncService = module.get<MoodleSyncService>(MoodleSyncService);
    moodleUserHydrationService = module.get<MoodleUserHydrationService>(
      MoodleUserHydrationService,
    );
    jwtService = module.get<CustomJwtService>(CustomJwtService);
    unitOfWork = module.get<UnitOfWork>(UnitOfWork);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Login', () => {
    it('should login locally if user has a password', async () => {
      const password = 'password123';
      const hashedPassword = await bcrypt.hash(password, 10);
      const mockUser = new User();
      mockUser.userName = 'admin';
      mockUser.password = hashedPassword;
      mockUser.id = 'user-id';

      const mockEm = {
        findOne: jest.fn().mockResolvedValue(mockUser),
        getRepository: jest.fn().mockReturnValue({}),
      };

      (unitOfWork.runInTransaction as jest.Mock).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        (cb: (em: any) => any) => cb(mockEm),
      );

      (jwtService.CreateSignedTokens as jest.Mock).mockResolvedValue({
        token: 'access',
        refreshToken: 'refresh',
      });

      const mockMetadata = {
        browserName: 'test',
        os: 'test',
        ipAddress: '127.0.0.1',
      };

      const result = await service.Login(
        { username: 'admin', password: 'password123' },
        mockMetadata,
      );

      expect(mockEm.findOne).toHaveBeenCalledWith(User, { userName: 'admin' });
      expect(result).toBeDefined();
      expect(result.token).toBe('access');
    });

    it('should fall back to Moodle login if no local user exists', async () => {
      const mockEm = {
        findOne: jest.fn().mockResolvedValue(null),
        getRepository: jest.fn().mockReturnValue({
          UpsertFromMoodle: jest.fn(),
        }),
      };

      (unitOfWork.runInTransaction as jest.Mock).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        (cb: (em: any) => any) => cb(mockEm),
      );

      (moodleService.Login as jest.Mock).mockResolvedValue({
        token: 'moodle-token',
      });

      const mockUser = new User();
      mockUser.id = 'moodle-user-id';
      mockUser.moodleUserId = 123;
      (moodleSyncService.SyncUserContext as jest.Mock).mockResolvedValue(
        mockUser,
      );

      (jwtService.CreateSignedTokens as jest.Mock).mockResolvedValue({
        token: 'access',
        refreshToken: 'refresh',
      });

      const mockMetadata = {
        browserName: 'test',
        os: 'test',
        ipAddress: '127.0.0.1',
      };

      await service.Login(
        { username: 'moodleuser', password: 'moodlepassword' },
        mockMetadata,
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(moodleService.Login).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(moodleSyncService.SyncUserContext).toHaveBeenCalledWith(
        'moodle-token',
      );
    });

    it('should throw UnauthorizedException if local password is invalid', async () => {
      const mockUser = new User();
      mockUser.userName = 'admin';
      mockUser.password = await bcrypt.hash('correct-password', 10);

      const mockEm = {
        findOne: jest.fn().mockResolvedValue(mockUser),
      };

      (unitOfWork.runInTransaction as jest.Mock).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        (cb: (em: any) => any) => cb(mockEm),
      );

      const mockMetadata = {
        browserName: 'test',
        os: 'test',
        ipAddress: '127.0.0.1',
      };

      await expect(
        service.Login(
          { username: 'admin', password: 'wrong-password' },
          mockMetadata,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
