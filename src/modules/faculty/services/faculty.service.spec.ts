import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { FacultyService } from './faculty.service';
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';
import { UserRole } from 'src/modules/auth/roles.enum';
import { User } from 'src/entities/user.entity';
import { ListFacultyQueryDto } from '../dto/requests/list-faculty-query.dto';

describe('FacultyService', () => {
  let service: FacultyService;
  let em: {
    findOne: jest.Mock;
    find: jest.Mock;
    getConnection: jest.Mock;
  };
  let scopeResolver: { ResolveDepartmentIds: jest.Mock };
  let executeMock: jest.Mock;

  const semesterId = 'semester-1';
  const deptId = 'dept-1';
  const deptId2 = 'dept-2';
  const programId = 'program-1';

  const superAdmin = {
    id: 'admin-1',
    roles: [UserRole.SUPER_ADMIN],
  } as unknown as User;

  const dean = {
    id: 'dean-1',
    roles: [UserRole.DEAN],
  } as unknown as User;

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

  function setupEmptyResults() {
    executeMock.mockResolvedValue([{ count: '0' }]);
  }

  function setupFacultyResults(
    users: User[],
    enrollments: { user: { id: string }; course: { shortname: string } }[],
    totalCount: number,
  ) {
    executeMock
      .mockResolvedValueOnce([{ count: String(totalCount) }])
      .mockResolvedValueOnce(users.map((u) => ({ user_id: u.id })));

    em.find.mockResolvedValueOnce(users).mockResolvedValueOnce(enrollments);
  }

  describe('super admin sees all faculty', () => {
    it('should return all faculty with no scope restriction', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const user1 = mockUser('u1', 'John Doe', 'John', 'Doe', 'pic.jpg');
      const user2 = mockUser('u2', 'Jane Smith', 'Jane', 'Smith', 'pic2.jpg');

      setupFacultyResults(
        [user1, user2],
        [mockEnrollment('u1', 'FREAI'), mockEnrollment('u2', 'ELEMSYS')],
        2,
      );

      const result = await service.ListFaculty(superAdmin, baseQuery);

      expect(result.data).toHaveLength(2);
      expect(result.meta.totalItems).toBe(2);
      expect(scopeResolver.ResolveDepartmentIds).toHaveBeenCalledWith(
        superAdmin,
        semesterId,
      );
    });
  });

  describe('dean sees only faculty in their department scope', () => {
    it('should return only scoped faculty', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      const user1 = mockUser('u1', 'John Doe', 'John', 'Doe', 'pic.jpg');

      setupFacultyResults([user1], [mockEnrollment('u1', 'FREAI')], 1);

      const result = await service.ListFaculty(dean, baseQuery);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].fullName).toBe('John Doe');
    });
  });

  describe('pagination', () => {
    it('should return correct PaginationMeta', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const users = Array.from({ length: 5 }, (_, i) =>
        mockUser(`u${i}`, `User ${i}`, 'First', 'Last', ''),
      );

      executeMock
        .mockResolvedValueOnce([{ count: '12' }])
        .mockResolvedValueOnce(users.map((u) => ({ user_id: u.id })));

      em.find
        .mockResolvedValueOnce(users)
        .mockResolvedValueOnce(users.map((u) => mockEnrollment(u.id, 'CS101')));

      const result = await service.ListFaculty(superAdmin, {
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
    });
  });

  describe('search filter', () => {
    it('should apply ILIKE on fullName', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      setupEmptyResults();

      await service.ListFaculty(superAdmin, {
        ...baseQuery,
        search: 'Varst',
      });

      // Verify the count query was called with search param
      const countCall = executeMock.mock.calls[0] as [string, unknown[]];
      expect(countCall[0]).toContain('ILIKE');
      expect(countCall[1]).toContain('%Varst%');
    });
  });

  describe('departmentId outside dean scope', () => {
    it('should return 403', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      await expect(
        service.ListFaculty(dean, {
          ...baseQuery,
          departmentId: deptId2,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('programId not belonging to department', () => {
    it('should return 400', async () => {
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({
          id: programId,
          department: { id: deptId2 },
        });

      await expect(
        service.ListFaculty(superAdmin, {
          ...baseQuery,
          departmentId: deptId,
          programId,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('programId without departmentId outside dean scope', () => {
    it('should return 403', async () => {
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({
          id: programId,
          department: { id: deptId2 },
        });

      await expect(
        service.ListFaculty(dean, {
          ...baseQuery,
          programId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('faculty deduplication', () => {
    it('should return single entry with all shortnames for faculty teaching multiple courses', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const user1 = mockUser('u1', 'John Doe', 'John', 'Doe', 'pic.jpg');

      setupFacultyResults(
        [user1],
        [
          mockEnrollment('u1', 'FREAI'),
          mockEnrollment('u1', 'ELEMSYS'),
          mockEnrollment('u1', 'ELDNET1'),
        ],
        1,
      );

      const result = await service.ListFaculty(superAdmin, baseQuery);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].subjects).toEqual(['ELDNET1', 'ELEMSYS', 'FREAI']);
    });
  });

  describe('subjects sorted alphabetically', () => {
    it('should sort subjects array', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const user1 = mockUser('u1', 'John Doe', 'John', 'Doe', '');

      setupFacultyResults(
        [user1],
        [
          mockEnrollment('u1', 'ZETA'),
          mockEnrollment('u1', 'ALPHA'),
          mockEnrollment('u1', 'MIDDLE'),
        ],
        1,
      );

      const result = await service.ListFaculty(superAdmin, baseQuery);

      expect(result.data[0].subjects).toEqual(['ALPHA', 'MIDDLE', 'ZETA']);
    });
  });

  describe('empty result', () => {
    it('should return empty data with zero meta', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      setupEmptyResults();

      const result = await service.ListFaculty(superAdmin, baseQuery);

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
    it('should escape % and _ in search term', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      setupEmptyResults();

      await service.ListFaculty(superAdmin, {
        ...baseQuery,
        search: '%admin_test',
      });

      const countCall = executeMock.mock.calls[0] as [string, unknown[]];
      expect(countCall[1]).toContain('%\\%admin\\_test%');
    });
  });

  describe('non-existent semesterId', () => {
    it('should return 404', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(service.ListFaculty(superAdmin, baseQuery)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('fullName fallback', () => {
    it('should use firstName + lastName when fullName is null', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const user1 = mockUser('u1', undefined, 'John', 'Doe', '');

      setupFacultyResults([user1], [mockEnrollment('u1', 'CS101')], 1);

      const result = await service.ListFaculty(superAdmin, baseQuery);

      expect(result.data[0].fullName).toBe('John Doe');
    });
  });

  describe('page beyond totalPages', () => {
    it('should return empty data with correct currentPage', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      executeMock
        .mockResolvedValueOnce([{ count: '3' }])
        .mockResolvedValueOnce([]);

      em.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.ListFaculty(superAdmin, {
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

  describe('dean with empty department scope', () => {
    it('should return empty results when no departments match semester', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([]);

      executeMock.mockResolvedValueOnce([{ count: '0' }]);

      const result = await service.ListFaculty(dean, baseQuery);

      expect(result.data).toEqual([]);
      expect(result.meta.totalItems).toBe(0);
    });
  });

  describe('empty profilePicture', () => {
    it('should return profilePicture as null when empty string', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const user1 = mockUser('u1', 'John Doe', 'John', 'Doe', '');

      setupFacultyResults([user1], [mockEnrollment('u1', 'CS101')], 1);

      const result = await service.ListFaculty(superAdmin, baseQuery);

      expect(result.data[0].profilePicture).toBeNull();
    });

    it('should return profilePicture when present', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const user1 = mockUser('u1', 'John Doe', 'John', 'Doe', 'http://pic.jpg');

      setupFacultyResults([user1], [mockEnrollment('u1', 'CS101')], 1);

      const result = await service.ListFaculty(superAdmin, baseQuery);

      expect(result.data[0].profilePicture).toBe('http://pic.jpg');
    });
  });
});
