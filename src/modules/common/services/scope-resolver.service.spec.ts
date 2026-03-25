import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { ScopeResolverService } from './scope-resolver.service';
import { CurrentUserService } from '../cls/current-user.service';
import { UserRole } from 'src/modules/auth/roles.enum';
import { User } from 'src/entities/user.entity';

describe('ScopeResolverService', () => {
  let service: ScopeResolverService;
  let em: { find: jest.Mock };
  let currentUserService: { getOrFail: jest.Mock };

  const semesterId = 'semester-1';

  const createUser = (roles: UserRole[], id = 'user-1'): User =>
    ({ id, roles }) as unknown as User;

  beforeEach(async () => {
    em = { find: jest.fn() };
    currentUserService = {
      getOrFail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScopeResolverService,
        { provide: EntityManager, useValue: em },
        { provide: CurrentUserService, useValue: currentUserService },
      ],
    }).compile();

    service = module.get(ScopeResolverService);
  });

  it('should return null for super admin (unrestricted)', async () => {
    const user = createUser([UserRole.SUPER_ADMIN]);
    currentUserService.getOrFail.mockReturnValue(user);

    const result = await service.ResolveDepartmentIds(semesterId);

    expect(result).toBeNull();
    expect(em.find).not.toHaveBeenCalled();
  });

  it('should return department IDs for dean with one department', async () => {
    const user = createUser([UserRole.DEAN]);
    currentUserService.getOrFail.mockReturnValue(user);

    em.find
      .mockResolvedValueOnce([{ moodleCategory: { moodleCategoryId: 100 } }])
      .mockResolvedValueOnce([{ id: 'dept-1' }]);

    const result = await service.ResolveDepartmentIds(semesterId);

    expect(result).toEqual(['dept-1']);
    expect(em.find).toHaveBeenCalledTimes(2);
  });

  it('should return multiple department IDs for dean with multiple departments', async () => {
    const user = createUser([UserRole.DEAN]);
    currentUserService.getOrFail.mockReturnValue(user);

    em.find
      .mockResolvedValueOnce([
        { moodleCategory: { moodleCategoryId: 100 } },
        { moodleCategory: { moodleCategoryId: 200 } },
      ])
      .mockResolvedValueOnce([{ id: 'dept-1' }, { id: 'dept-2' }]);

    const result = await service.ResolveDepartmentIds(semesterId);

    expect(result).toEqual(['dept-1', 'dept-2']);
  });

  it('should return empty array for dean with no institutional roles for given semester', async () => {
    const user = createUser([UserRole.DEAN]);
    currentUserService.getOrFail.mockReturnValue(user);

    em.find.mockResolvedValueOnce([]);

    const result = await service.ResolveDepartmentIds(semesterId);

    expect(result).toEqual([]);
    expect(em.find).toHaveBeenCalledTimes(1);
  });

  it('should return department IDs for chairperson via program-to-department lookup', async () => {
    const user = createUser([UserRole.CHAIRPERSON]);
    currentUserService.getOrFail.mockReturnValue(user);

    em.find
      .mockResolvedValueOnce([{ moodleCategory: { moodleCategoryId: 13 } }]) // institutional roles
      .mockResolvedValueOnce([{ id: 'prog-1', department: { id: 'dept-1' } }]); // programs

    const result = await service.ResolveDepartmentIds(semesterId);

    expect(result).toEqual(['dept-1']);
    expect(em.find).toHaveBeenCalledTimes(2);
  });

  it('should deduplicate departments for chairperson with multiple programs in same department', async () => {
    const user = createUser([UserRole.CHAIRPERSON]);
    currentUserService.getOrFail.mockReturnValue(user);

    em.find
      .mockResolvedValueOnce([
        { moodleCategory: { moodleCategoryId: 13 } },
        { moodleCategory: { moodleCategoryId: 18 } },
      ])
      .mockResolvedValueOnce([
        { id: 'prog-1', department: { id: 'dept-1' } },
        { id: 'prog-2', department: { id: 'dept-1' } },
      ]);

    const result = await service.ResolveDepartmentIds(semesterId);

    expect(result).toEqual(['dept-1']);
  });

  it('should return empty array for chairperson with no institutional roles', async () => {
    const user = createUser([UserRole.CHAIRPERSON]);
    currentUserService.getOrFail.mockReturnValue(user);

    em.find.mockResolvedValueOnce([]);

    const result = await service.ResolveDepartmentIds(semesterId);

    expect(result).toEqual([]);
    expect(em.find).toHaveBeenCalledTimes(1);
  });

  it('should prioritize DEAN over CHAIRPERSON when user has both roles', async () => {
    const user = createUser([UserRole.DEAN, UserRole.CHAIRPERSON]);
    currentUserService.getOrFail.mockReturnValue(user);

    em.find
      .mockResolvedValueOnce([{ moodleCategory: { moodleCategoryId: 100 } }])
      .mockResolvedValueOnce([{ id: 'dept-1' }]);

    const result = await service.ResolveDepartmentIds(semesterId);

    expect(result).toEqual(['dept-1']);
  });

  it('should throw ForbiddenException for user with neither SUPER_ADMIN, DEAN, nor CHAIRPERSON role', async () => {
    const user = createUser([UserRole.FACULTY]);
    currentUserService.getOrFail.mockReturnValue(user);

    await expect(service.ResolveDepartmentIds(semesterId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should throw ForbiddenException for student role', async () => {
    const user = createUser([UserRole.STUDENT]);
    currentUserService.getOrFail.mockReturnValue(user);

    await expect(service.ResolveDepartmentIds(semesterId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should prioritize SUPER_ADMIN when user has both SUPER_ADMIN and DEAN roles', async () => {
    const user = createUser([UserRole.SUPER_ADMIN, UserRole.DEAN]);
    currentUserService.getOrFail.mockReturnValue(user);

    const result = await service.ResolveDepartmentIds(semesterId);

    expect(result).toBeNull();
    expect(em.find).not.toHaveBeenCalled();
  });
});
