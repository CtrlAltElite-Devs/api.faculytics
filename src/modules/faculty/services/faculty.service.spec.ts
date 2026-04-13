import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { QueryOrder } from '@mikro-orm/core';
import { FacultyService } from './faculty.service';
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';
import { User } from 'src/entities/user.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import { ListFacultyQueryDto } from '../dto/requests/list-faculty-query.dto';

describe('FacultyService', () => {
  let service: FacultyService;
  let em: {
    findOne: jest.Mock;
    find: jest.Mock;
    findAndCount: jest.Mock;
    count: jest.Mock;
    getConnection: jest.Mock;
  };
  let scopeResolver: { ResolveDepartmentIds: jest.Mock };
  let executeMock: jest.Mock;

  const semesterId = 'semester-1';
  const deptId = 'dept-1';
  const deptId2 = 'dept-2';
  const programId = 'program-1';

  const baseQuery: ListFacultyQueryDto = {
    semesterId,
    page: 1,
    limit: 20,
  };

  const mockUser = (
    id: string,
    fullName: string | undefined,
    firstName: string,
    lastName: string,
    profilePicture: string,
  ) =>
    ({
      id,
      fullName,
      firstName,
      lastName,
      userProfilePicture: profilePicture,
    }) as unknown as User;

  const mockEnrollment = (userId: string, courseShortname: string) => ({
    user: { id: userId },
    course: { shortname: courseShortname },
  });

  beforeEach(async () => {
    executeMock = jest.fn();

    em = {
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      count: jest.fn(),
      getConnection: jest.fn().mockReturnValue({ execute: executeMock }),
    };

    scopeResolver = {
      ResolveDepartmentIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacultyService,
        { provide: EntityManager, useValue: em },
        { provide: ScopeResolverService, useValue: scopeResolver },
      ],
    }).compile();

    service = module.get(FacultyService);
  });

  function setupSemesterFound() {
    em.findOne.mockResolvedValue({ id: semesterId });
  }

  function call(mock: jest.Mock, callIndex = 0): unknown[] {
    return (mock.mock.calls[callIndex] ?? []) as unknown[];
  }

  function filterOf(mock: jest.Mock, callIndex = 0): Record<string, unknown> {
    return (call(mock, callIndex)[1] ?? {}) as Record<string, unknown>;
  }

  function optsOf(mock: jest.Mock, callIndex = 0): Record<string, unknown> {
    return (call(mock, callIndex)[2] ?? {}) as Record<string, unknown>;
  }

  /**
   * Prime `findAndCount` (primary user query) and `em.find` (subjects
   * enrichment). The enrichment query only fires when users.length > 0.
   */
  function primePrimary(
    users: User[],
    totalCount: number,
    enrollments: ReturnType<typeof mockEnrollment>[] = [],
  ) {
    em.findAndCount.mockResolvedValueOnce([users, totalCount]);
    if (users.length > 0) {
      em.find.mockResolvedValueOnce(enrollments);
    }
  }

  describe('super admin sees all faculty', () => {
    it('returns all faculty, excluding NULL home dept', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const user1 = mockUser('u1', 'John Doe', 'John', 'Doe', 'pic.jpg');
      const user2 = mockUser('u2', 'Jane Smith', 'Jane', 'Smith', 'pic2.jpg');

      primePrimary([user1, user2], 2, [
        mockEnrollment('u1', 'FREAI'),
        mockEnrollment('u2', 'ELEMSYS'),
      ]);

      const result = await service.ListFaculty(baseQuery);

      expect(result.data).toHaveLength(2);
      expect(result.meta.totalItems).toBe(2);
      expect(scopeResolver.ResolveDepartmentIds).toHaveBeenCalledWith(
        semesterId,
      );

      expect(filterOf(em.findAndCount)).toMatchObject({
        roles: { $contains: [UserRole.FACULTY] },
        isActive: true,
        department: { $ne: null },
      });
      expect(optsOf(em.findAndCount).orderBy).toEqual({
        fullName: QueryOrder.ASC_NULLS_LAST,
        id: QueryOrder.ASC,
      });
    });
  });

  describe('dean sees only faculty in their department scope', () => {
    it('scopes department to $in', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      const user1 = mockUser('u1', 'John Doe', 'John', 'Doe', 'pic.jpg');
      primePrimary([user1], 1, [mockEnrollment('u1', 'FREAI')]);

      const result = await service.ListFaculty(baseQuery);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].fullName).toBe('John Doe');

      expect(filterOf(em.findAndCount).department).toEqual({ $in: [deptId] });
    });
  });

  describe('cross-dept leak prevented on primary list (AC 2)', () => {
    it('filters by home department — SOE-home teaching CCS is absent from CCS dean', async () => {
      // A CCS dean's scope is [CCS]. A SOE-home faculty teaching a CCS course
      // exists in the DB, but the home-dept filter excludes them outright.
      // We simulate this by asserting (a) the filter sent to findAndCount
      // narrows department to CCS, and (b) when the mock DB obeys that filter
      // and returns no rows, the SOE-home user does NOT appear in the response.
      setupSemesterFound();
      const ccsDept = 'ccs';
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([ccsDept]);

      // Mock DB honors the `department: { $in: [ccs] }` predicate -> 0 rows.
      primePrimary([], 0);

      const result = await service.ListFaculty(baseQuery);

      expect(filterOf(em.findAndCount).department).toEqual({ $in: [ccsDept] });
      expect(result.data).toEqual([]);
      // Contrast with legacy enrollment-join semantics: under the old query,
      // the SOE-home faculty teaching the CCS course would leak in. Here they
      // cannot — the DB is never asked for non-CCS-home users.
    });
  });

  describe('pagination', () => {
    it('returns correct PaginationMeta', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const users = Array.from({ length: 5 }, (_, i) =>
        mockUser(`u${i}`, `User ${i}`, 'First', 'Last', ''),
      );
      primePrimary(
        users,
        12,
        users.map((u) => mockEnrollment(u.id, 'CS101')),
      );

      const result = await service.ListFaculty({
        ...baseQuery,
        page: 2,
        limit: 5,
      });

      expect(result.meta).toEqual({
        totalItems: 12,
        itemCount: 5,
        itemsPerPage: 5,
        totalPages: 3,
        currentPage: 2,
      });

      const opts = optsOf(em.findAndCount);
      expect(opts.limit).toBe(5);
      expect(opts.offset).toBe(5);
    });
  });

  describe('search filter', () => {
    it('applies $ilike on fullName with wrapping %', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      primePrimary([], 0);

      await service.ListFaculty({ ...baseQuery, search: 'Varst' });

      expect(filterOf(em.findAndCount).fullName).toEqual({
        $ilike: '%Varst%',
      });
    });
  });

  describe('departmentId outside dean scope', () => {
    it('throws ForbiddenException', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      await expect(
        service.ListFaculty({ ...baseQuery, departmentId: deptId2 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('programId not belonging to department', () => {
    it('throws BadRequestException', async () => {
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({ id: programId, department: { id: deptId2 } });

      await expect(
        service.ListFaculty({
          ...baseQuery,
          departmentId: deptId,
          programId,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('programId without departmentId outside dean scope', () => {
    it('throws ForbiddenException', async () => {
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({ id: programId, department: { id: deptId2 } });

      await expect(
        service.ListFaculty({ ...baseQuery, programId }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('subjects aggregation', () => {
    it('dedupes and sorts shortnames for faculty teaching multiple courses', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const user1 = mockUser('u1', 'John Doe', 'John', 'Doe', 'pic.jpg');
      primePrimary([user1], 1, [
        mockEnrollment('u1', 'FREAI'),
        mockEnrollment('u1', 'ELEMSYS'),
        mockEnrollment('u1', 'ELDNET1'),
      ]);

      const result = await service.ListFaculty(baseQuery);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].subjects).toEqual(['ELDNET1', 'ELEMSYS', 'FREAI']);
    });
  });

  describe('subjects sorted alphabetically', () => {
    it('sorts subjects array', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const user1 = mockUser('u1', 'John Doe', 'John', 'Doe', '');
      primePrimary([user1], 1, [
        mockEnrollment('u1', 'ZETA'),
        mockEnrollment('u1', 'ALPHA'),
        mockEnrollment('u1', 'MIDDLE'),
      ]);

      const result = await service.ListFaculty(baseQuery);

      expect(result.data[0].subjects).toEqual(['ALPHA', 'MIDDLE', 'ZETA']);
    });
  });

  describe('empty result', () => {
    it('returns empty data with zero meta', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      primePrimary([], 0);

      const result = await service.ListFaculty(baseQuery);

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
  });

  describe('LIKE wildcard escaping', () => {
    it('escapes % and _ in search term', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      primePrimary([], 0);

      await service.ListFaculty({ ...baseQuery, search: '%admin_test' });

      expect(filterOf(em.findAndCount).fullName).toEqual({
        $ilike: '%\\%admin\\_test%',
      });
    });
  });

  describe('non-existent semesterId', () => {
    it('throws NotFoundException', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(service.ListFaculty(baseQuery)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('fullName fallback', () => {
    it('uses firstName + lastName when fullName is null', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const user1 = mockUser('u1', undefined, 'John', 'Doe', '');
      primePrimary([user1], 1, [mockEnrollment('u1', 'CS101')]);

      const result = await service.ListFaculty(baseQuery);

      expect(result.data[0].fullName).toBe('John Doe');
    });
  });

  describe('page beyond totalPages', () => {
    it('returns empty data with correct currentPage', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      // findAndCount reports totalCount=3 but page=5 gives no rows.
      em.findAndCount.mockResolvedValueOnce([[], 3]);

      const result = await service.ListFaculty({
        ...baseQuery,
        page: 5,
        limit: 5,
      });

      expect(result.data).toHaveLength(0);
      expect(result.meta).toEqual({
        totalItems: 3,
        itemCount: 0,
        itemsPerPage: 5,
        totalPages: 1,
        currentPage: 5,
      });
    });
  });

  describe('dean with empty department scope (AC 19)', () => {
    it('short-circuits without calling findAndCount', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([]);

      const result = await service.ListFaculty(baseQuery);

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
      expect(em.findAndCount).not.toHaveBeenCalled();
      expect(em.find).not.toHaveBeenCalled();
    });
  });

  describe('empty profilePicture', () => {
    it('returns profilePicture as null when empty string', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const user1 = mockUser('u1', 'John Doe', 'John', 'Doe', '');
      primePrimary([user1], 1, [mockEnrollment('u1', 'CS101')]);

      const result = await service.ListFaculty(baseQuery);

      expect(result.data[0].profilePicture).toBeNull();
    });

    it('returns profilePicture when present', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const user1 = mockUser('u1', 'John Doe', 'John', 'Doe', 'http://pic.jpg');
      primePrimary([user1], 1, [mockEnrollment('u1', 'CS101')]);

      const result = await service.ListFaculty(baseQuery);

      expect(result.data[0].profilePicture).toBe('http://pic.jpg');
    });
  });

  // ---------------------------------------------------------------------------
  // New spec blocks covering FAC-129 ACs 4, 5, 6, 17, 18, 20, 21, 22.
  // ---------------------------------------------------------------------------

  describe('home-dept faculty with zero scope-visible teaching (AC 3)', () => {
    it('appears in data with subjects: []', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      const user1 = mockUser('u1', 'Orphan Teacher', 'Orphan', 'T', '');
      // enrollment enrichment returns no rows.
      primePrimary([user1], 1, []);

      const result = await service.ListFaculty(baseQuery);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].subjects).toEqual([]);
    });
  });

  describe('excludes faculty with NULL home department (AC 4, AC 18)', () => {
    it('filter.department is {$ne: null} under super-admin', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      primePrimary([], 0);

      await service.ListFaculty(baseQuery);

      expect(filterOf(em.findAndCount).department).toEqual({ $ne: null });
    });

    it('filter.department is {$in: [...]} under scoped caller', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId, deptId2]);
      primePrimary([], 0);

      await service.ListFaculty(baseQuery);

      expect(filterOf(em.findAndCount).department).toEqual({
        $in: [deptId, deptId2],
      });
    });
  });

  describe('departmentId param filters user.department (AC 5)', () => {
    it('scalar department overrides scope predicate', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      primePrimary([], 0);

      await service.ListFaculty({ ...baseQuery, departmentId: deptId });

      expect(filterOf(em.findAndCount).department).toBe(deptId);
    });
  });

  describe('programId param filters user.program (AC 6)', () => {
    it('scalar program on the user filter', async () => {
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({ id: programId, department: { id: deptId } });
      primePrimary([], 0);

      await service.ListFaculty({ ...baseQuery, programId });

      expect(filterOf(em.findAndCount).program).toBe(programId);
    });
  });

  describe('inactive faculty excluded (AC 20)', () => {
    it('filter always includes isActive: true', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);
      primePrimary([], 0);

      await service.ListFaculty(baseQuery);

      expect(filterOf(em.findAndCount).isActive).toBe(true);
    });
  });

  describe('dual-role faculty included (AC 21)', () => {
    it('includes user whose roles contain FACULTY', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      const dualRole = mockUser('u1', 'Dual Hat', 'Dual', 'Hat', '');
      (dualRole as unknown as { roles: UserRole[] }).roles = [
        UserRole.FACULTY,
        UserRole.DEAN,
      ];
      primePrimary([dualRole], 1, [mockEnrollment('u1', 'CS101')]);

      const result = await service.ListFaculty(baseQuery);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('u1');

      expect(filterOf(em.findAndCount).roles).toEqual({
        $contains: [UserRole.FACULTY],
      });
    });
  });

  describe('subjects enrichment skipped on empty result (AC 22)', () => {
    it('does not issue enrollment query when findAndCount returns []', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.findAndCount.mockResolvedValueOnce([[], 0]);

      await service.ListFaculty(baseQuery);

      expect(em.find).not.toHaveBeenCalled();
    });
  });

  describe('orderBy uses fullName ASC NULLS LAST then id ASC', () => {
    it('passes the documented orderBy to findAndCount', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      primePrimary([], 0);

      await service.ListFaculty(baseQuery);

      expect(optsOf(em.findAndCount).orderBy).toEqual({
        fullName: QueryOrder.ASC_NULLS_LAST,
        id: QueryOrder.ASC,
      });
    });
  });

  describe('subjects enrichment uses scope-visible courses (AC 17)', () => {
    it('passes semester + scope course filter to em.find(Enrollment, ...)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      const user1 = mockUser('u1', 'Jane', 'Jane', 'Doe', '');
      primePrimary([user1], 1, [mockEnrollment('u1', 'A')]);

      await service.ListFaculty(baseQuery);

      const findCall = call(em.find, 0);
      expect(findCall[0]).toBe(Enrollment);
      const findFilter = findCall[1] as Record<string, unknown>;
      expect(findFilter).toMatchObject({
        user: { $in: ['u1'] },
        isActive: true,
        course: {
          isActive: true,
          program: {
            department: {
              semester: semesterId,
              id: { $in: [deptId] },
            },
          },
        },
      });
      const findOpts = findCall[2] as { populate: string[] };
      expect(findOpts.populate).toEqual(['course']);
    });
  });

  // ---------------------------------------------------------------------------
  // ListCrossDepartmentTeaching (secondary endpoint) — ACs 13, 14, 15, 23.
  // ---------------------------------------------------------------------------

  describe('ListCrossDepartmentTeaching', () => {
    function primeCrossDeptEmpty() {
      executeMock.mockResolvedValueOnce([{ count: '0' }]);
    }

    function primeCrossDept(
      userIds: string[],
      totalCount: number,
      users: User[],
      enrollments: ReturnType<typeof mockEnrollment>[],
    ) {
      executeMock
        .mockResolvedValueOnce([{ count: String(totalCount) }])
        .mockResolvedValueOnce(userIds.map((id) => ({ user_id: id })));
      em.find.mockResolvedValueOnce(users).mockResolvedValueOnce(enrollments);
    }

    it('generated SQL restricts to true cross-dept (AC 13) and excludes NULL/soft-deleted home (ACs 14, 23)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);
      primeCrossDeptEmpty();

      await service.ListCrossDepartmentTeaching(baseQuery);

      const [countSql] = executeMock.mock.calls[0] as [string, unknown[]];
      // Normalize whitespace to make conjunction assertions robust to
      // formatting changes in the SQL builder.
      const normalized = countSql.replace(/\s+/g, ' ');

      // The three cross-dept predicates must be combined via AND so each
      // individually narrows the result set (not OR'd, which would widen).
      expect(normalized).toMatch(
        /u\.department_id IS NOT NULL AND u\.department_id <> d\.id AND EXISTS \(SELECT 1 FROM department hd WHERE hd\.id = u\.department_id AND hd\.deleted_at IS NULL\)/,
      );
    });

    it('returns empty list when scope resolves to [] (short-circuit)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([]);

      const result = await service.ListCrossDepartmentTeaching(baseQuery);

      expect(result.data).toEqual([]);
      expect(result.meta.totalItems).toBe(0);
      expect(executeMock).not.toHaveBeenCalled();
      expect(em.find).not.toHaveBeenCalled();
    });

    it('paginates + enriches subjects from scope-visible enrollments (AC 15)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      const user1 = mockUser('u1', 'Alice', 'Alice', 'Smith', '');
      primeCrossDept(
        ['u1'],
        1,
        [user1],
        [mockEnrollment('u1', 'BETA'), mockEnrollment('u1', 'ALPHA')],
      );

      const result = await service.ListCrossDepartmentTeaching({
        ...baseQuery,
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].subjects).toEqual(['ALPHA', 'BETA']);
      expect(result.meta).toEqual({
        totalItems: 1,
        itemCount: 1,
        itemsPerPage: 10,
        totalPages: 1,
        currentPage: 1,
      });

      // The second execute() call receives limit + offset appended.
      const paginatedCall = executeMock.mock.calls[1] as [string, unknown[]];
      expect(paginatedCall[1].slice(-2)).toEqual([10, 0]);
    });

    it('throws ForbiddenException when departmentId outside dean scope', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      await expect(
        service.ListCrossDepartmentTeaching({
          ...baseQuery,
          departmentId: deptId2,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when semester missing', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(
        service.ListCrossDepartmentTeaching(baseQuery),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when programId does not exist (parity with primary)', async () => {
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce(null);

      await expect(
        service.ListCrossDepartmentTeaching({
          ...baseQuery,
          programId: 'missing-program',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates LIKE wildcard escaping to the raw SQL params (AC 15 parity)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);
      primeCrossDeptEmpty();

      await service.ListCrossDepartmentTeaching({
        ...baseQuery,
        search: '%admin_test',
      });

      const [, params] = executeMock.mock.calls[0] as [string, unknown[]];
      expect(params).toContain('%\\%admin\\_test%');
    });
  });

  describe('GetSubmissionCount', () => {
    const facultyId = 'faculty-1';

    it('returns count 0 when user and semester exist but no submissions', async () => {
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({ id: facultyId });
      em.count.mockResolvedValue(0);

      const result = await service.GetSubmissionCount(facultyId, semesterId);

      expect(result).toEqual({ count: 0 });
    });

    it('returns correct count when submissions exist', async () => {
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({ id: facultyId });
      em.count.mockResolvedValue(5);

      const result = await service.GetSubmissionCount(facultyId, semesterId);

      expect(result).toEqual({ count: 5 });
    });

    it('throws NotFoundException when semester does not exist', async () => {
      em.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: facultyId });

      await expect(
        service.GetSubmissionCount(facultyId, semesterId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when user does not exist', async () => {
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce(null);

      await expect(
        service.GetSubmissionCount(facultyId, semesterId),
      ).rejects.toThrow(NotFoundException);
    });

    it('calls em.count with correct filter shape', async () => {
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({ id: facultyId });
      em.count.mockResolvedValue(3);

      await service.GetSubmissionCount(facultyId, semesterId);

      expect(em.count).toHaveBeenCalledWith(expect.any(Function), {
        faculty: facultyId,
        semester: semesterId,
      });
    });
  });
});
