import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerException,
  ThrottlerStorage,
  getOptionsToken,
} from '@nestjs/throttler';
import { CustomThrottlerGuard } from './throttle.guard';

describe('CustomThrottlerGuard', () => {
  let guard: CustomThrottlerGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomThrottlerGuard,
        {
          provide: getOptionsToken(),
          useValue: [{ ttl: 60000, limit: 60 }],
        },
        { provide: ThrottlerStorage, useValue: {} },
        Reflector,
      ],
    }).compile();

    guard = module.get(CustomThrottlerGuard);
  });

  function createMockContext(): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ ip: '127.0.0.1' }),
        getResponse: () => ({ header: jest.fn() }),
      }),
      getType: jest.fn().mockReturnValue('http'),
    } as unknown as ExecutionContext;
  }

  it('should extend ThrottlerGuard', () => {
    expect(guard).toBeInstanceOf(ThrottlerGuard);
  });

  it('should re-throw ThrottlerException (legitimate 429)', async () => {
    jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockRejectedValueOnce(new ThrottlerException('Too Many Requests'));

    await expect(guard.canActivate(createMockContext())).rejects.toThrow(
      ThrottlerException,
    );
  });

  it('should fail open on non-throttle errors (e.g., Redis down)', async () => {
    jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await guard.canActivate(createMockContext());
    expect(result).toBe(true);
  });

  it('should fail open on non-Error throws', async () => {
    jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockRejectedValueOnce('unexpected string error');

    const result = await guard.canActivate(createMockContext());
    expect(result).toBe(true);
  });
});
