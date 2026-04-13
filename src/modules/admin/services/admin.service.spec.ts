import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import { Enrollment } from 'src/entities/enrollment.entity';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import { AuditService } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/modules/audit/audit-action.enum';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let em: {
    findAndCount: jest.Mock;
    findOneOrFail: jest.Mock;
    create: jest.Mock;
    upsert: jest.Mock;
    find: jest.Mock;
    flush: jest.Mock;
    assign: jest.Mock;
  };
  let auditService: { Emit: jest.Mock };
  let currentUserService: { get: jest.Mock };

  beforeEach(async () => {
    em = {
      findAndCount: jest.fn(),
      findOneOrFail: jest.fn(),
      create: jest
        .fn()
        .mockImplementation((_entity: unknown, data: unknown) => data),
      upsert: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      flush: jest.fn(),
      assign: jest.fn().mockImplementation((entity: object, patch: object) => {
        Object.assign(entity, patch);
        return entity;
      }),
    };

    auditService = { Emit: jest.fn().mockResolvedValue(undefined) };
    currentUserService = {
      get: jest.fn().mockReturnValue({ id: 'actor-1', userName: 'admin' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: EntityManager, useValue: em },
        { provide: AuditService, useValue: auditService },
        { provide: CurrentUserService, useValue: currentUserService },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  it('should return paginated users mapped for admin console display', async () => {
    const user = {
      id: 'user-1',
      userName: 'jdoe',
      fullName: 'John Doe',
      moodleUserId: 123,
      roles: [UserRole.FACULTY],
      isActive: true,
      campus: { id: 'campus-1', code: 'UCMN', name: 'Main' },
      department: { id: 'dept-1', code: 'CCS', name: 'Computer Studies' },
      program: { id: 'prog-1', code: 'BSCS', name: 'Computer Science' },
    } as User;

    em.findAndCount.mockResolvedValue([[user], 1]);

    const result = await service.ListUsers({ page: 1, limit: 20 });

    expect(result.data).toEqual([
      {
        id: 'user-1',
        userName: 'jdoe',
        fullName: 'John Doe',
        moodleUserId: 123,
        roles: [UserRole.FACULTY],
        isActive: true,
        campus: { id: 'campus-1', code: 'UCMN', name: 'Main' },
        department: {
          id: 'dept-1',
          code: 'CCS',
          name: 'Computer Studies',
        },
        program: {
          id: 'prog-1',
          code: 'BSCS',
          name: 'Computer Science',
        },
      },
    ]);
    expect(result.meta).toEqual({
      totalItems: 1,
      itemCount: 1,
      itemsPerPage: 20,
      totalPages: 1,
      currentPage: 1,
    });
  });

  it('should build a search filter across id and name fields', async () => {
    em.findAndCount.mockResolvedValue([[], 0]);

    await service.ListUsers({ search: 'john', page: 1, limit: 20 });

    expect(em.findAndCount).toHaveBeenCalledWith(
      User,
      expect.objectContaining({
        $or: [
          { id: { $ilike: '%john%' } },
          { userName: { $ilike: '%john%' } },
          { fullName: { $ilike: '%john%' } },
          { firstName: { $ilike: '%john%' } },
          { lastName: { $ilike: '%john%' } },
        ],
      }),
      expect.any(Object),
    );
  });

  it('should apply role, active state, and relation filters', async () => {
    em.findAndCount.mockResolvedValue([[], 0]);

    await service.ListUsers({
      role: UserRole.SUPER_ADMIN,
      isActive: false,
      campusId: 'campus-1',
      departmentId: 'dept-1',
      programId: 'prog-1',
      page: 1,
      limit: 20,
    });

    expect(em.findAndCount).toHaveBeenCalledWith(
      User,
      {
        roles: { $contains: [UserRole.SUPER_ADMIN] },
        isActive: false,
        campus: 'campus-1',
        department: 'dept-1',
        program: 'prog-1',
      },
      expect.any(Object),
    );
  });

  it('should return null relation payloads when relation data is absent', async () => {
    const user = {
      id: 'user-2',
      userName: 'asmith',
      firstName: 'Anna',
      lastName: 'Smith',
      fullName: null,
      roles: [UserRole.STUDENT],
      isActive: false,
      campus: null,
      department: null,
      program: null,
    } as unknown as User;

    em.findAndCount.mockResolvedValue([[user], 1]);

    const result = await service.ListUsers({ page: 1, limit: 20 });

    expect(result.data[0]).toEqual({
      id: 'user-2',
      userName: 'asmith',
      fullName: 'Anna Smith',
      moodleUserId: undefined,
      roles: [UserRole.STUDENT],
      isActive: false,
      campus: null,
      department: null,
      program: null,
    });
  });

  it('should use stable ordering and pagination options', async () => {
    em.findAndCount.mockResolvedValue([[], 0]);

    await service.ListUsers({ page: 3, limit: 15 });

    expect(em.findAndCount).toHaveBeenCalledWith(
      User,
      {},
      expect.objectContaining({
        limit: 15,
        offset: 30,
        orderBy: { userName: 'ASC', id: 'ASC' },
        populate: ['campus', 'department', 'program'],
      }),
    );
  });

  it('should return empty pagination metadata when there are no matches', async () => {
    em.findAndCount.mockResolvedValue([[], 0]);

    const result = await service.ListUsers({ page: 1, limit: 20 });

    expect(result).toEqual({
      data: [],
      meta: {
        totalItems: 0,
        itemCount: 0,
        itemsPerPage: 20,
        totalPages: 0,
        currentPage: 1,
      },
    });
  });

  describe('GetUserDetail', () => {
    const mockUser = {
      id: 'user-1',
      userName: 'jdoe',
      fullName: 'John Doe',
      firstName: 'John',
      lastName: 'Doe',
      moodleUserId: 123,
      userProfilePicture: 'https://example.com/pic.jpg',
      roles: [UserRole.FACULTY],
      isActive: true,
      lastLoginAt: new Date('2026-03-01'),
      createdAt: new Date('2026-01-01'),
      campus: { id: 'campus-1', code: 'UCMN', name: 'Main' },
      department: { id: 'dept-1', code: 'CCS', name: 'Computer Studies' },
      program: { id: 'prog-1', code: 'BSCS', name: 'Computer Science' },
    } as unknown as User;

    it('should return full user detail with enrollments and institutional roles', async () => {
      const mockEnrollments = [
        {
          id: 'enr-1',
          role: 'student',
          isActive: true,
          course: {
            id: 'course-1',
            shortname: 'CS101',
            fullname: 'Intro to CS',
          },
        },
      ];
      const mockInstitutionalRoles = [
        {
          id: 'ir-1',
          role: UserRole.DEAN,
          source: 'manual',
          moodleCategory: {
            moodleCategoryId: 8,
            name: 'CCS',
            depth: 3,
          },
        },
      ];

      em.findOneOrFail.mockResolvedValueOnce(mockUser);
      em.find
        .mockResolvedValueOnce(mockEnrollments)
        .mockResolvedValueOnce(mockInstitutionalRoles);

      const result = await service.GetUserDetail('user-1');

      expect(result.id).toBe('user-1');
      expect(result.userName).toBe('jdoe');
      expect(result.fullName).toBe('John Doe');
      expect(result.enrollments).toHaveLength(1);
      expect(result.enrollments[0]).toEqual({
        id: 'enr-1',
        role: 'student',
        isActive: true,
        course: {
          id: 'course-1',
          shortname: 'CS101',
          fullname: 'Intro to CS',
        },
      });
      expect(result.institutionalRoles).toHaveLength(1);
      expect(result.institutionalRoles[0]).toEqual({
        id: 'ir-1',
        role: UserRole.DEAN,
        source: 'manual',
        category: {
          moodleCategoryId: 8,
          name: 'CCS',
          depth: 3,
        },
      });
    });

    it('should use fullName fallback when fullName is null', async () => {
      const userWithoutFullName = {
        ...mockUser,
        fullName: null,
        firstName: 'Anna',
        lastName: 'Smith',
      } as unknown as User;

      em.findOneOrFail.mockResolvedValueOnce(userWithoutFullName);
      em.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.GetUserDetail('user-1');

      expect(result.fullName).toBe('Anna Smith');
    });

    it('should return empty arrays when user has no enrollments or roles', async () => {
      em.findOneOrFail.mockResolvedValueOnce(mockUser);
      em.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.GetUserDetail('user-1');

      expect(result.enrollments).toEqual([]);
      expect(result.institutionalRoles).toEqual([]);
      expect(result.id).toBe('user-1');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      em.findOneOrFail.mockImplementationOnce(
        (
          _entity: unknown,
          _filter: unknown,
          opts: { failHandler: () => Error },
        ) => {
          throw opts.failHandler();
        },
      );

      await expect(service.GetUserDetail('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should filter enrollments by isActive and course.isActive', async () => {
      em.findOneOrFail.mockResolvedValueOnce(mockUser);
      em.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.GetUserDetail('user-1');

      expect(em.find).toHaveBeenCalledWith(
        Enrollment,
        { user: 'user-1', isActive: true, course: { isActive: true } },
        expect.objectContaining({
          populate: ['course'],
          orderBy: { timeModified: 'DESC' },
        }),
      );
    });
  });

  describe('AssignInstitutionalRole', () => {
    const mockUser = {
      id: 'user-1',
      roles: [UserRole.FACULTY],
      updateRolesFromEnrollments: jest.fn(),
    } as unknown as User;

    it('should auto-resolve DEAN at depth 4 to parent department at depth 3', async () => {
      const programCategory = {
        moodleCategoryId: 18,
        name: 'BSCS',
        depth: 4,
        parentMoodleCategoryId: 8,
      };
      const deptCategory = {
        moodleCategoryId: 8,
        name: 'CCS',
        depth: 3,
      };

      em.findOneOrFail
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce(programCategory) // initial category lookup
        .mockResolvedValueOnce(deptCategory); // parent category lookup

      await service.AssignInstitutionalRole({
        userId: 'user-1',
        role: UserRole.DEAN,
        moodleCategoryId: 18,
      });

      expect(em.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ moodleCategory: deptCategory }),
        expect.anything(),
      );
    });

    it('should accept DEAN assignment directly at depth 3', async () => {
      const deptCategory = {
        moodleCategoryId: 8,
        name: 'CCS',
        depth: 3,
      };

      em.findOneOrFail
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(deptCategory);

      await service.AssignInstitutionalRole({
        userId: 'user-1',
        role: UserRole.DEAN,
        moodleCategoryId: 8,
      });

      expect(em.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ moodleCategory: deptCategory }),
        expect.anything(),
      );
    });

    it('should reject DEAN assignment at depth 2', async () => {
      const semesterCategory = {
        moodleCategoryId: 6,
        name: 'S22526',
        depth: 2,
      };

      em.findOneOrFail
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(semesterCategory);

      await expect(
        service.AssignInstitutionalRole({
          userId: 'user-1',
          role: UserRole.DEAN,
          moodleCategoryId: 6,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow CHAIRPERSON assignment at any depth without validation', async () => {
      const programCategory = {
        moodleCategoryId: 18,
        name: 'BSCS',
        depth: 4,
      };

      em.findOneOrFail
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(programCategory);

      await service.AssignInstitutionalRole({
        userId: 'user-1',
        role: UserRole.CHAIRPERSON,
        moodleCategoryId: 18,
      });

      expect(em.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ moodleCategory: programCategory }),
        expect.anything(),
      );
    });
  });

  describe('GetDeanEligibleCategories', () => {
    const mockUser = { id: 'user-1' } as User;

    const deptCCS = {
      moodleCategoryId: 8,
      name: 'CCS',
      depth: 3,
      parentMoodleCategoryId: 6,
    };

    const deptCOE = {
      moodleCategoryId: 12,
      name: 'COE',
      depth: 3,
      parentMoodleCategoryId: 6,
    };

    const programBSCS = {
      moodleCategoryId: 18,
      name: 'BSCS',
      depth: 4,
      parentMoodleCategoryId: 8,
    };

    const programBSIT = {
      moodleCategoryId: 19,
      name: 'BSIT',
      depth: 4,
      parentMoodleCategoryId: 8,
    };

    const programBSCE = {
      moodleCategoryId: 20,
      name: 'BSCE',
      depth: 4,
      parentMoodleCategoryId: 12,
    };

    it('should resolve depth-4 CHAIRPERSON to parent depth-3 department', async () => {
      em.findOneOrFail.mockResolvedValueOnce(mockUser);
      em.find
        .mockResolvedValueOnce([
          { role: UserRole.CHAIRPERSON, moodleCategory: programBSCS },
        ])
        .mockResolvedValueOnce([deptCCS]);

      const result = await service.GetDeanEligibleCategories('user-1');

      expect(result).toEqual([{ moodleCategoryId: 8, name: 'CCS' }]);
    });

    it('should return depth-3 CHAIRPERSON directly (manual-assignment scenario)', async () => {
      em.findOneOrFail.mockResolvedValueOnce(mockUser);
      em.find.mockResolvedValueOnce([
        { role: UserRole.CHAIRPERSON, moodleCategory: deptCCS },
      ]);

      const result = await service.GetDeanEligibleCategories('user-1');

      expect(result).toEqual([{ moodleCategoryId: 8, name: 'CCS' }]);
    });

    it('should deduplicate when multiple depth-4 roles share the same parent department', async () => {
      em.findOneOrFail.mockResolvedValueOnce(mockUser);
      em.find
        .mockResolvedValueOnce([
          { role: UserRole.CHAIRPERSON, moodleCategory: programBSCS },
          { role: UserRole.CHAIRPERSON, moodleCategory: programBSIT },
        ])
        .mockResolvedValueOnce([deptCCS]);

      const result = await service.GetDeanEligibleCategories('user-1');

      expect(result).toEqual([{ moodleCategoryId: 8, name: 'CCS' }]);
    });

    it('should exclude categories where user is already DEAN', async () => {
      em.findOneOrFail.mockResolvedValueOnce(mockUser);
      em.find
        .mockResolvedValueOnce([
          { role: UserRole.DEAN, moodleCategory: deptCCS },
          { role: UserRole.CHAIRPERSON, moodleCategory: programBSCS },
        ])
        .mockResolvedValueOnce([deptCCS]);

      const result = await service.GetDeanEligibleCategories('user-1');

      expect(result).toEqual([]);
    });

    it('should throw NotFoundException for invalid userId', async () => {
      em.findOneOrFail.mockImplementationOnce(
        (
          _entity: unknown,
          _filter: unknown,
          opts: { failHandler: () => Error },
        ) => {
          throw opts.failHandler();
        },
      );

      await expect(
        service.GetDeanEligibleCategories('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return empty array when user has no institutional roles', async () => {
      em.findOneOrFail.mockResolvedValueOnce(mockUser);
      em.find.mockResolvedValueOnce([]);

      const result = await service.GetDeanEligibleCategories('user-1');

      expect(result).toEqual([]);
    });

    it('should return only non-DEAN departments in mixed scenario', async () => {
      em.findOneOrFail.mockResolvedValueOnce(mockUser);
      em.find
        .mockResolvedValueOnce([
          { role: UserRole.DEAN, moodleCategory: deptCCS },
          { role: UserRole.CHAIRPERSON, moodleCategory: programBSCS },
          { role: UserRole.CHAIRPERSON, moodleCategory: programBSCE },
        ])
        .mockResolvedValueOnce([deptCCS, deptCOE]);

      const result = await service.GetDeanEligibleCategories('user-1');

      expect(result).toEqual([{ moodleCategoryId: 12, name: 'COE' }]);
    });

    it('should silently skip CHAIRPERSON roles at unexpected depths (not 3 or 4)', async () => {
      const semesterCategory = {
        moodleCategoryId: 6,
        name: 'S22526',
        depth: 2,
        parentMoodleCategoryId: 1,
      };

      em.findOneOrFail.mockResolvedValueOnce(mockUser);
      em.find.mockResolvedValueOnce([
        { role: UserRole.CHAIRPERSON, moodleCategory: semesterCategory },
      ]);

      const result = await service.GetDeanEligibleCategories('user-1');

      expect(result).toEqual([]);
    });

    it('should return results sorted alphabetically by name', async () => {
      em.findOneOrFail.mockResolvedValueOnce(mockUser);
      em.find
        .mockResolvedValueOnce([
          { role: UserRole.CHAIRPERSON, moodleCategory: programBSCS },
          { role: UserRole.CHAIRPERSON, moodleCategory: programBSCE },
        ])
        .mockResolvedValueOnce([deptCCS, deptCOE]);

      const result = await service.GetDeanEligibleCategories('user-1');

      expect(result).toEqual([
        { moodleCategoryId: 8, name: 'CCS' },
        { moodleCategoryId: 12, name: 'COE' },
      ]);
    });
  });

  describe('UpdateUserScopeAssignment', () => {
    type ScopeUser = {
      id: string;
      department: { id: string; code: string; name?: string } | null;
      program: { id: string; code: string; name?: string } | null;
      departmentSource: string;
      programSource: string;
    };

    type EmitArg = {
      action: string;
      actorId?: string;
      actorUsername?: string;
      resourceType?: string;
      resourceId?: string;
      metadata: {
        before: Record<string, string | null>;
        after: Record<string, string | null>;
        changedFields: string[];
      };
    };

    function lastEmit(): EmitArg {
      const calls = auditService.Emit.mock.calls as unknown as EmitArg[][];
      return calls[calls.length - 1][0];
    }

    function makeUser(overrides: Partial<ScopeUser> = {}): ScopeUser {
      return {
        id: 'user-1',
        department: {
          id: 'old-dept-uuid',
          code: 'CCS',
          name: 'Computer Studies',
        },
        program: {
          id: 'old-prog-uuid',
          code: 'BSCS',
          name: 'Computer Science',
        },
        departmentSource: 'auto',
        programSource: 'auto',
        ...overrides,
      };
    }

    it('happy path — set department only', async () => {
      const user = makeUser();
      const newDept = { id: 'new-dept-uuid', code: 'COE', name: 'Engineering' };
      em.findOneOrFail
        .mockResolvedValueOnce(user) // user
        .mockResolvedValueOnce(newDept); // department

      const result = await service.UpdateUserScopeAssignment('user-1', {
        departmentId: 'new-dept-uuid',
      });

      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(user.department).toBe(newDept);
      expect(user.departmentSource).toBe('manual');
      expect(user.program?.id).toBe('old-prog-uuid');
      expect(user.programSource).toBe('auto');
      const emit = lastEmit();
      expect(emit.action).toBe(AuditAction.ADMIN_USER_SCOPE_UPDATE);
      expect(emit.actorId).toBe('actor-1');
      expect(emit.actorUsername).toBe('admin');
      expect(emit.resourceType).toBe('User');
      expect(emit.resourceId).toBe('user-1');
      expect(emit.metadata.changedFields).toEqual([
        'department',
        'departmentSource',
      ]);
      expect(emit.metadata.before.department).toBe('old-dept-uuid');
      expect(emit.metadata.before.departmentSource).toBe('auto');
      expect(emit.metadata.after.department).toBe('new-dept-uuid');
      expect(emit.metadata.after.departmentSource).toBe('manual');
      expect(result.id).toBe('user-1');
    });

    it('happy path — set program only', async () => {
      const user = makeUser();
      const newProg = { id: 'new-prog-uuid', code: 'BSIT', name: 'IT' };
      em.findOneOrFail
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(newProg);

      await service.UpdateUserScopeAssignment('user-1', {
        programId: 'new-prog-uuid',
      });

      expect(user.program).toBe(newProg);
      expect(user.programSource).toBe('manual');
      expect(user.department?.id).toBe('old-dept-uuid');
      expect(user.departmentSource).toBe('auto');
      expect(lastEmit().metadata.changedFields).toEqual([
        'program',
        'programSource',
      ]);
    });

    it('happy path — set both matching dept and program', async () => {
      const user = makeUser();
      const programWithDept = {
        id: 'new-prog-uuid',
        code: 'BSIT',
        department: { id: 'new-dept-uuid' },
      };
      const newDept = { id: 'new-dept-uuid', code: 'COE' };
      const newProg = { id: 'new-prog-uuid', code: 'BSIT' };
      em.findOneOrFail
        .mockResolvedValueOnce(user) // user
        .mockResolvedValueOnce(programWithDept) // consistency-guard program lookup
        .mockResolvedValueOnce(newDept) // dept apply
        .mockResolvedValueOnce(newProg); // program apply

      await service.UpdateUserScopeAssignment('user-1', {
        departmentId: 'new-dept-uuid',
        programId: 'new-prog-uuid',
      });

      expect(user.departmentSource).toBe('manual');
      expect(user.programSource).toBe('manual');
      expect(lastEmit().metadata.changedFields).toEqual([
        'department',
        'departmentSource',
        'program',
        'programSource',
      ]);
    });

    it('rejects mismatched dept and program', async () => {
      const user = makeUser();
      const programWithOtherDept = {
        id: 'prog-x',
        department: { id: 'other-dept-uuid' },
      };
      em.findOneOrFail
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(programWithOtherDept);

      await expect(
        service.UpdateUserScopeAssignment('user-1', {
          departmentId: 'new-dept-uuid',
          programId: 'prog-x',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(em.flush).not.toHaveBeenCalled();
      expect(auditService.Emit).not.toHaveBeenCalled();
    });

    it('reset department to auto — program unchanged', async () => {
      // Decision #16: post-reset divergence is intentional.
      const user = makeUser({ departmentSource: 'manual' });
      em.findOneOrFail.mockResolvedValueOnce(user);

      await service.UpdateUserScopeAssignment('user-1', { departmentId: null });

      expect(em.assign).toHaveBeenCalledWith(user, { department: null });
      expect(user.department).toBeNull();
      expect(user.departmentSource).toBe('auto');
      expect(user.program?.id).toBe('old-prog-uuid');
      expect(user.programSource).toBe('auto');
      expect(lastEmit().metadata.changedFields).toEqual([
        'department',
        'departmentSource',
      ]);
    });

    it('reset both fields to auto', async () => {
      const user = makeUser({
        departmentSource: 'manual',
        programSource: 'manual',
      });
      em.findOneOrFail.mockResolvedValueOnce(user);

      await service.UpdateUserScopeAssignment('user-1', {
        departmentId: null,
        programId: null,
      });

      expect(em.assign).toHaveBeenCalledWith(user, { department: null });
      expect(em.assign).toHaveBeenCalledWith(user, { program: null });
      expect(user.departmentSource).toBe('auto');
      expect(user.programSource).toBe('auto');
      expect(lastEmit().metadata.changedFields).toEqual([
        'department',
        'departmentSource',
        'program',
        'programSource',
      ]);
    });

    it('throws NotFoundException when user is missing', async () => {
      em.findOneOrFail.mockImplementationOnce(
        (
          _entity: unknown,
          _filter: unknown,
          opts: { failHandler: () => Error },
        ) => {
          throw opts.failHandler();
        },
      );

      await expect(
        service.UpdateUserScopeAssignment('missing', {
          departmentId: 'd1',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(em.flush).not.toHaveBeenCalled();
      expect(auditService.Emit).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when department is missing', async () => {
      const user = makeUser();
      em.findOneOrFail
        .mockResolvedValueOnce(user)
        .mockImplementationOnce(
          (
            _entity: unknown,
            _filter: unknown,
            opts: { failHandler: () => Error },
          ) => {
            throw opts.failHandler();
          },
        );

      await expect(
        service.UpdateUserScopeAssignment('user-1', {
          departmentId: 'no-such-dept',
        }),
      ).rejects.toThrow(/Department not found/);
      expect(em.flush).not.toHaveBeenCalled();
      expect(auditService.Emit).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when program is missing', async () => {
      const user = makeUser();
      em.findOneOrFail
        .mockResolvedValueOnce(user)
        .mockImplementationOnce(
          (
            _entity: unknown,
            _filter: unknown,
            opts: { failHandler: () => Error },
          ) => {
            throw opts.failHandler();
          },
        );

      await expect(
        service.UpdateUserScopeAssignment('user-1', {
          programId: 'no-such-prog',
        }),
      ).rejects.toThrow(/Program not found/);
      expect(em.flush).not.toHaveBeenCalled();
      expect(auditService.Emit).not.toHaveBeenCalled();
    });

    it('audit emit forward-compat: rejects from Emit do not break the request', async () => {
      // Defensive against future Emit signature changes — Emit currently
      // swallows queue failures internally, but we test the rejection path
      // anyway to lock in forward-compat.
      const user = makeUser();
      const newDept = { id: 'new-dept-uuid', code: 'COE' };
      em.findOneOrFail
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(newDept);
      auditService.Emit.mockRejectedValueOnce(new Error('queue down'));

      const serviceWithLogger = service as unknown as {
        logger: { warn: (...args: unknown[]) => void };
      };
      const warnSpy = jest
        .spyOn(serviceWithLogger.logger, 'warn')
        .mockImplementation(() => undefined);

      const result = await service.UpdateUserScopeAssignment('user-1', {
        departmentId: 'new-dept-uuid',
      });

      expect(result.id).toBe('user-1');
      expect(warnSpy).toHaveBeenCalled();
    });

    it('returns minimal response shape (no enrollments, no roles)', async () => {
      const user = makeUser();
      const newDept = { id: 'new-dept-uuid', code: 'COE', name: 'Engineering' };
      em.findOneOrFail
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(newDept);

      const result = await service.UpdateUserScopeAssignment('user-1', {
        departmentId: 'new-dept-uuid',
      });

      expect(Object.keys(result).sort()).toEqual(
        [
          'department',
          'departmentSource',
          'id',
          'program',
          'programSource',
        ].sort(),
      );
    });

    it('actor missing — emits with undefined actorId/actorUsername', async () => {
      currentUserService.get.mockReturnValueOnce(null);
      const user = makeUser();
      const newDept = { id: 'new-dept-uuid', code: 'COE' };
      em.findOneOrFail
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(newDept);

      await service.UpdateUserScopeAssignment('user-1', {
        departmentId: 'new-dept-uuid',
      });

      const emit = lastEmit();
      expect(emit.actorId).toBeUndefined();
      expect(emit.actorUsername).toBeUndefined();
    });
  });
});
