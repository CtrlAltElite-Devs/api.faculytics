import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { UserRepository } from 'src/repositories/user.repository';
import { UserRole } from 'src/modules/auth/roles.enum';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let userRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    userRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        Reflector,
        { provide: UserRepository, useValue: userRepository },
      ],
    }).compile();

    guard = module.get(RolesGuard);
    reflector = module.get(Reflector);
  });

  function createMockContext(userId?: string): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: userId ? { userId } : undefined,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should allow access when no roles metadata is set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const result = await guard.canActivate(createMockContext('user-1'));
    expect(result).toBe(true);
  });

  it('should allow access when user has a matching role', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN, UserRole.SUPER_ADMIN]);

    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      roles: [UserRole.ADMIN],
    });

    const result = await guard.canActivate(createMockContext('user-1'));
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException when user lacks required role', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.SUPER_ADMIN]);

    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      roles: [UserRole.STUDENT],
    });

    await expect(
      guard.canActivate(createMockContext('user-1')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when request.user is missing', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);

    await expect(guard.canActivate(createMockContext())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should throw ForbiddenException when user is not found in database', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);

    userRepository.findOne.mockResolvedValue(null);

    await expect(
      guard.canActivate(createMockContext('user-1')),
    ).rejects.toThrow(ForbiddenException);
  });
});
