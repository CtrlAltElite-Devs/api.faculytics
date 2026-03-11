import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheService } from './cache.service';
import { CacheNamespace } from './cache-namespaces';

describe('CacheService', () => {
  let service: CacheService;
  let cacheMock: {
    get: jest.Mock;
    wrap: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    cacheMock = {
      get: jest.fn().mockResolvedValue(undefined),
      wrap: jest
        .fn()
        .mockImplementation((_key: string, fn: () => Promise<unknown>) => fn()),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: CACHE_MANAGER, useValue: cacheMock },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('wrap', () => {
    it('should delegate to cache.wrap on cache miss', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      cacheMock.wrap.mockResolvedValue('result');

      const result = await service.wrap(
        CacheNamespace.ENROLLMENTS_ME,
        'user1:1:10',
        fn,
        1800000,
      );

      expect(result).toBe('result');
      expect(cacheMock.get).toHaveBeenCalledWith('enrollments-me:user1:1:10');
      expect(cacheMock.wrap).toHaveBeenCalledWith(
        'enrollments-me:user1:1:10',
        fn,
        1800000,
      );
    });

    it('should return cached value and skip fn on cache hit', async () => {
      cacheMock.get.mockResolvedValue('cached-data');
      const fn = jest.fn().mockResolvedValue('fresh-data');

      const result = await service.wrap(
        CacheNamespace.QUESTIONNAIRE_TYPES,
        'all',
        fn,
      );

      expect(result).toBe('cached-data');
      expect(fn).not.toHaveBeenCalled();
      expect(cacheMock.wrap).not.toHaveBeenCalled();
    });

    it('should track keys in the registry', async () => {
      const fn = jest.fn().mockResolvedValue('data');

      await service.wrap(CacheNamespace.QUESTIONNAIRE_TYPES, 'all', fn);

      // Verify tracking by invalidating and checking del calls
      await service.invalidateNamespace(CacheNamespace.QUESTIONNAIRE_TYPES);

      expect(cacheMock.del).toHaveBeenCalledWith('q-types:all');
    });

    it('should track multiple keys in the same namespace', async () => {
      const fn = jest.fn().mockResolvedValue('data');

      await service.wrap(CacheNamespace.ENROLLMENTS_ME, 'user1:1:10', fn);
      await service.wrap(CacheNamespace.ENROLLMENTS_ME, 'user2:1:10', fn);

      await service.invalidateNamespace(CacheNamespace.ENROLLMENTS_ME);

      expect(cacheMock.del).toHaveBeenCalledTimes(2);
      expect(cacheMock.del).toHaveBeenCalledWith('enrollments-me:user1:1:10');
      expect(cacheMock.del).toHaveBeenCalledWith('enrollments-me:user2:1:10');
    });
  });

  describe('invalidateNamespace', () => {
    it('should delete all tracked keys and clear the set', async () => {
      const fn = jest.fn().mockResolvedValue('data');

      await service.wrap(CacheNamespace.QUESTIONNAIRE_VERSIONS, 'type-a', fn);
      await service.wrap(CacheNamespace.QUESTIONNAIRE_VERSIONS, 'type-b', fn);

      await service.invalidateNamespace(CacheNamespace.QUESTIONNAIRE_VERSIONS);

      expect(cacheMock.del).toHaveBeenCalledWith('q-versions:type-a');
      expect(cacheMock.del).toHaveBeenCalledWith('q-versions:type-b');

      // After invalidation, calling again should be a no-op
      cacheMock.del.mockClear();
      await service.invalidateNamespace(CacheNamespace.QUESTIONNAIRE_VERSIONS);
      expect(cacheMock.del).not.toHaveBeenCalled();
    });

    it('should no-op when namespace has no tracked keys', async () => {
      await service.invalidateNamespace(CacheNamespace.ENROLLMENTS_ME);

      expect(cacheMock.del).not.toHaveBeenCalled();
    });
  });

  describe('invalidateNamespaces', () => {
    it('should invalidate multiple namespaces', async () => {
      const fn = jest.fn().mockResolvedValue('data');

      await service.wrap(CacheNamespace.QUESTIONNAIRE_TYPES, 'all', fn);
      await service.wrap(CacheNamespace.QUESTIONNAIRE_VERSIONS, 'type-a', fn);

      await service.invalidateNamespaces(
        CacheNamespace.QUESTIONNAIRE_TYPES,
        CacheNamespace.QUESTIONNAIRE_VERSIONS,
      );

      expect(cacheMock.del).toHaveBeenCalledWith('q-types:all');
      expect(cacheMock.del).toHaveBeenCalledWith('q-versions:type-a');
    });
  });
});
