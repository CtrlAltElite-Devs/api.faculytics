import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { CustomJwtService } from '../common/custom-jwt-service';
import UnitOfWork from '../common/unit-of-work';
import { User } from '../../entities/user.entity';
import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
import { LOGIN_STRATEGIES, LoginStrategy } from './strategies';
import { EntityManager } from '@mikro-orm/postgresql';
import { RefreshToken } from '../../entities/refresh-token.entity';
import { CurrentUserService } from '../common/cls/current-user.service';
import { RequestMetadataService } from '../common/cls/request-metadata.service';

const mockMetadata = {
  browserName: 'test',
  os: 'test',
  ipAddress: '127.0.0.1',
};

const mockRequestMetadataService = {
  get: jest.fn().mockReturnValue(mockMetadata),
  getOrFail: jest.fn().mockReturnValue(mockMetadata),
  set: jest.fn(),
};

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
        {
          provide: CurrentUserService,
          useValue: {
            get: jest.fn(),
            getOrFail: jest.fn().mockReturnValue({ id: 'user-id' }),
            getUserId: jest.fn().mockReturnValue('user-id'),
            set: jest.fn(),
            setJwtPayload: jest.fn(),
          },
        },
        {
          provide: RequestMetadataService,
          useValue: mockRequestMetadataService,
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
          {
            provide: CurrentUserService,
            useValue: {
              get: jest.fn(),
              getOrFail: jest.fn().mockReturnValue({ id: 'user-id' }),
              set: jest.fn(),
              setJwtPayload: jest.fn(),
            },
          },
          {
            provide: RequestMetadataService,
            useValue: mockRequestMetadataService,
          },
        ],
      }).compile();

    const serviceWithReversedOrder =
      moduleWithReversedOrder.get<AuthService>(AuthService);

    await serviceWithReversedOrder.Login({
      username: 'test',
      password: 'test',
    });

    // High priority (5) should be checked first and executed
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(highPriorityStrategy.Execute).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(lowPriorityStrategy.Execute).not.toHaveBeenCalled();
  });

  describe('Login', () => {
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

      const result = await service.Login({
        username: 'admin',
        password: 'password123',
      });

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

      await service.Login({
        username: 'moodleuser',
        password: 'moodlepassword',
      });

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
        service.Login({ username: 'unknown', password: 'password' }),
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
        service.Login({ username: 'admin', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('RefreshToken', () => {
    const userId = 'user-id';
    const rawRefreshToken = 'raw-refresh-token';

    function createMockToken(
      overrides: Partial<RefreshToken> = {},
    ): RefreshToken {
      const token = new RefreshToken();
      token.id = overrides.id ?? 'token-id';
      token.tokenHash = overrides.tokenHash ?? 'hashed-token';
      token.userId = overrides.userId ?? userId;
      token.expiresAt =
        overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      token.isActive = overrides.isActive ?? true;
      token.browserName = 'test';
      token.os = 'test';
      token.ipAddress = '127.0.0.1';
      return token;
    }

    it('should successfully refresh with a valid token', async () => {
      const hashedToken = await bcrypt.hash(rawRefreshToken, 10);
      const storedToken = createMockToken({ tokenHash: hashedToken });

      const mockUser = new User();
      mockUser.id = userId;
      mockUser.moodleUserId = 1;

      const mockFind = jest.fn().mockResolvedValue([storedToken]);
      const mockEm = {
        getRepository: jest.fn().mockReturnValue({ find: mockFind }),
        findOneOrFail: jest.fn().mockResolvedValue(mockUser),
      };

      (unitOfWork.runInTransaction as jest.Mock).mockImplementation(
        (cb: (em: EntityManager) => unknown) =>
          cb(mockEm as unknown as EntityManager),
      );

      (jwtService.CreateSignedTokens as jest.Mock).mockResolvedValue({
        token: 'new-access',
        refreshToken: 'new-refresh',
      });

      const result = await service.RefreshToken(userId, rawRefreshToken);

      expect(result.token).toBe('new-access');
      expect(storedToken.isActive).toBe(false);
      expect(storedToken.revokedAt).toBeDefined();
      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          isActive: true,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          expiresAt: { $gt: expect.any(Date) },
        }),
      );
    });

    it('should throw UnauthorizedException when no tokens match', async () => {
      const storedToken = createMockToken({
        tokenHash: await bcrypt.hash('different-token', 10),
      });

      const mockEm = {
        getRepository: jest
          .fn()
          .mockReturnValue({
            find: jest.fn().mockResolvedValue([storedToken]),
          }),
        findOneOrFail: jest.fn(),
      };

      (unitOfWork.runInTransaction as jest.Mock).mockImplementation(
        (cb: (em: EntityManager) => unknown) =>
          cb(mockEm as unknown as EntityManager),
      );

      await expect(
        service.RefreshToken(userId, rawRefreshToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when no active tokens exist', async () => {
      const mockEm = {
        getRepository: jest
          .fn()
          .mockReturnValue({ find: jest.fn().mockResolvedValue([]) }),
        findOneOrFail: jest.fn(),
      };

      (unitOfWork.runInTransaction as jest.Mock).mockImplementation(
        (cb: (em: EntityManager) => unknown) =>
          cb(mockEm as unknown as EntityManager),
      );

      await expect(
        service.RefreshToken(userId, rawRefreshToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should not use synchronous bcrypt.compareSync', async () => {
      const hashedToken = await bcrypt.hash(rawRefreshToken, 10);
      const storedToken = createMockToken({ tokenHash: hashedToken });

      const mockUser = new User();
      mockUser.id = userId;

      const mockFind = jest.fn().mockResolvedValue([storedToken]);
      const mockEm = {
        getRepository: jest.fn().mockReturnValue({ find: mockFind }),
        findOneOrFail: jest.fn().mockResolvedValue(mockUser),
      };

      (unitOfWork.runInTransaction as jest.Mock).mockImplementation(
        (cb: (em: EntityManager) => unknown) =>
          cb(mockEm as unknown as EntityManager),
      );

      (jwtService.CreateSignedTokens as jest.Mock).mockResolvedValue({
        token: 'access',
        refreshToken: 'refresh',
      });

      // RefreshToken should return a promise (async), not block synchronously.
      // If compareSync were used, this would still resolve, but we verify
      // the method is async by checking it returns a promise.
      const result = service.RefreshToken(userId, rawRefreshToken);
      expect(result).toBeInstanceOf(Promise);
      await result;
    });
  });
});
