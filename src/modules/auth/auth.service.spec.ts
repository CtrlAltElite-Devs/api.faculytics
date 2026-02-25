import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { CustomJwtService } from '../common/custom-jwt-service';
import UnitOfWork from '../common/unit-of-work';
import { User } from '../../entities/user.entity';
import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
import { LOGIN_STRATEGIES, LoginStrategy } from './strategies';
import { EntityManager } from '@mikro-orm/postgresql';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: CustomJwtService;
  let unitOfWork: UnitOfWork;
  let mockLocalStrategy: jest.Mocked<LoginStrategy>;
  let mockMoodleStrategy: jest.Mocked<LoginStrategy>;

  beforeEach(async () => {
    mockLocalStrategy = {
      priority: 10,
      CanHandle: jest.fn(),
      Execute: jest.fn(),
    };

    mockMoodleStrategy = {
      priority: 100,
      CanHandle: jest.fn(),
      Execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: LOGIN_STRATEGIES,
          useValue: [mockLocalStrategy, mockMoodleStrategy],
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
              .mockImplementation((cb: (em: EntityManager) => unknown) =>
                cb({
                  getRepository: jest.fn().mockReturnValue({
                    UpsertFromMoodle: jest.fn(),
                    revokeAllForUser: jest.fn(),
                  }),
                  findOne: jest.fn(),
                  findOneOrFail: jest.fn(),
                } as unknown as EntityManager),
              ),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<CustomJwtService>(CustomJwtService);
    unitOfWork = module.get<UnitOfWork>(UnitOfWork);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should sort strategies by priority (lower priority first)', async () => {
    // Create strategies with reversed priority order in the array
    const highPriorityStrategy: jest.Mocked<LoginStrategy> = {
      priority: 5,
      CanHandle: jest.fn().mockReturnValue(true),
      Execute: jest.fn().mockResolvedValue({ user: new User() }),
    };

    const lowPriorityStrategy: jest.Mocked<LoginStrategy> = {
      priority: 200,
      CanHandle: jest.fn().mockReturnValue(true),
      Execute: jest.fn().mockResolvedValue({ user: new User() }),
    };

    // Inject in wrong order (low priority first)
    const moduleWithReversedOrder: TestingModule =
      await Test.createTestingModule({
        providers: [
          AuthService,
          {
            provide: LOGIN_STRATEGIES,
            useValue: [lowPriorityStrategy, highPriorityStrategy],
          },
          {
            provide: CustomJwtService,
            useValue: { CreateSignedTokens: jest.fn().mockResolvedValue({}) },
          },
          {
            provide: UnitOfWork,
            useValue: {
              runInTransaction: jest
                .fn()
                .mockImplementation((cb: (em: EntityManager) => unknown) =>
                  cb({ findOne: jest.fn() } as unknown as EntityManager),
                ),
            },
          },
        ],
      }).compile();

    const serviceWithReversedOrder =
      moduleWithReversedOrder.get<AuthService>(AuthService);

    await serviceWithReversedOrder.Login(
      { username: 'test', password: 'test' },
      { browserName: 'test', os: 'test', ipAddress: '127.0.0.1' },
    );

    // High priority (5) should be checked first and executed
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(highPriorityStrategy.Execute).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(lowPriorityStrategy.Execute).not.toHaveBeenCalled();
  });

  describe('Login', () => {
    const mockMetadata = {
      browserName: 'test',
      os: 'test',
      ipAddress: '127.0.0.1',
    };

    it('should use local strategy when user has a password', async () => {
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
        (cb: (em: EntityManager) => unknown) =>
          cb(mockEm as unknown as EntityManager),
      );

      mockLocalStrategy.CanHandle.mockReturnValue(true);
      mockMoodleStrategy.CanHandle.mockReturnValue(false);
      mockLocalStrategy.Execute.mockResolvedValue({ user: mockUser });

      (jwtService.CreateSignedTokens as jest.Mock).mockResolvedValue({
        token: 'access',
        refreshToken: 'refresh',
      });

      const result = await service.Login(
        { username: 'admin', password: 'password123' },
        mockMetadata,
      );

      expect(mockEm.findOne).toHaveBeenCalledWith(User, { userName: 'admin' });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLocalStrategy.CanHandle).toHaveBeenCalledWith(mockUser, {
        username: 'admin',
        password: 'password123',
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLocalStrategy.Execute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.token).toBe('access');
    });

    it('should use moodle strategy when no local user exists', async () => {
      const mockEm = {
        findOne: jest.fn().mockResolvedValue(null),
        getRepository: jest.fn().mockReturnValue({
          UpsertFromMoodle: jest.fn(),
        }),
      };

      (unitOfWork.runInTransaction as jest.Mock).mockImplementation(
        (cb: (em: EntityManager) => unknown) =>
          cb(mockEm as unknown as EntityManager),
      );

      const mockUser = new User();
      mockUser.id = 'moodle-user-id';
      mockUser.moodleUserId = 123;

      mockLocalStrategy.CanHandle.mockReturnValue(false);
      mockMoodleStrategy.CanHandle.mockReturnValue(true);
      mockMoodleStrategy.Execute.mockResolvedValue({
        user: mockUser,
        moodleToken: 'moodle-token',
      });

      (jwtService.CreateSignedTokens as jest.Mock).mockResolvedValue({
        token: 'access',
        refreshToken: 'refresh',
      });

      await service.Login(
        { username: 'moodleuser', password: 'moodlepassword' },
        mockMetadata,
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockMoodleStrategy.CanHandle).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockMoodleStrategy.Execute).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when no strategy can handle', async () => {
      const mockEm = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      (unitOfWork.runInTransaction as jest.Mock).mockImplementation(
        (cb: (em: EntityManager) => unknown) =>
          cb(mockEm as unknown as EntityManager),
      );

      mockLocalStrategy.CanHandle.mockReturnValue(false);
      mockMoodleStrategy.CanHandle.mockReturnValue(false);

      await expect(
        service.Login(
          { username: 'unknown', password: 'password' },
          mockMetadata,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when strategy execution fails', async () => {
      const mockUser = new User();
      mockUser.userName = 'admin';
      mockUser.password = await bcrypt.hash('correct-password', 10);

      const mockEm = {
        findOne: jest.fn().mockResolvedValue(mockUser),
      };

      (unitOfWork.runInTransaction as jest.Mock).mockImplementation(
        (cb: (em: EntityManager) => unknown) =>
          cb(mockEm as unknown as EntityManager),
      );

      mockLocalStrategy.CanHandle.mockReturnValue(true);
      mockLocalStrategy.Execute.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      await expect(
        service.Login(
          { username: 'admin', password: 'wrong-password' },
          mockMetadata,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
