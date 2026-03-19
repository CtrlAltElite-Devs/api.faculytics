import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { CurriculumService } from './curriculum.service';
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';

describe('CurriculumService', () => {
  let service: CurriculumService;
  let em: { findOne: jest.Mock; find: jest.Mock };
  let scopeResolver: { ResolveDepartmentIds: jest.Mock };

  const semesterId = 'semester-1';
  const deptId = 'dept-1';
  const deptId2 = 'dept-2';
  const programId = 'program-1';
  const programId2 = 'program-2';

  beforeEach(async () => {
    em = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    scopeResolver = {
      ResolveDepartmentIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurriculumService,
        { provide: EntityManager, useValue: em },
        { provide: ScopeResolverService, useValue: scopeResolver },
      ],
    }).compile();

    service = module.get(CurriculumService);
  });

  function setupSemesterFound() {
    em.findOne.mockResolvedValueOnce({ id: semesterId });
  }

  // ─── ListDepartments ──────────────────────────────────────────────

  describe('ListDepartments', () => {
    it('should return all departments for super admin (unrestricted scope)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const departments = [
        { id: deptId, code: 'CCS', name: 'College of Computer Studies' },
        { id: deptId2, code: 'CBA', name: 'College of Business Admin' },
      ];
      em.find.mockResolvedValue(departments);

      const result = await service.ListDepartments({ semesterId });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(deptId);
      expect(result[0].code).toBe('CCS');
      expect(result[0].name).toBe('College of Computer Studies');
      expect(scopeResolver.ResolveDepartmentIds).toHaveBeenCalledWith(
        semesterId,
      );
    });

    it('should return only scoped departments for dean', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      const departments = [
        { id: deptId, code: 'CCS', name: 'College of Computer Studies' },
      ];
      em.find.mockResolvedValue(departments);

      const result = await service.ListDepartments({ semesterId });

      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('CCS');
      // Verify scope filter was applied
      const findCall = em.find.mock.calls[0] as unknown[];
      expect(findCall[1]).toEqual(
        expect.objectContaining({ id: { $in: [deptId] } }),
      );
    });

    it('should return [] when dean has empty scope', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([]);

      const result = await service.ListDepartments({ semesterId });

      expect(result).toEqual([]);
      expect(em.find).not.toHaveBeenCalled();
    });

    it('should filter by search on code and name (OR, ILIKE)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.find.mockResolvedValue([]);

      await service.ListDepartments({ semesterId, search: 'Comp' });

      const findCall = em.find.mock.calls[0] as unknown[];
      expect(findCall[1]).toEqual(
        expect.objectContaining({
          $and: [
            {
              $or: [
                { code: { $ilike: '%Comp%' } },
                { name: { $ilike: '%Comp%' } },
              ],
            },
          ],
        }),
      );
    });

    it('should escape LIKE wildcards in search', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.find.mockResolvedValue([]);

      await service.ListDepartments({ semesterId, search: '%admin_test' });

      const findCall = em.find.mock.calls[0] as unknown[];
      expect(findCall[1]).toEqual(
        expect.objectContaining({
          $and: [
            {
              $or: [
                { code: { $ilike: '%\\%admin\\_test%' } },
                { name: { $ilike: '%\\%admin\\_test%' } },
              ],
            },
          ],
        }),
      );
    });

    it('should throw 404 for non-existent semesterId', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(service.ListDepartments({ semesterId })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return [] when no departments match', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.find.mockResolvedValue([]);

      const result = await service.ListDepartments({ semesterId });

      expect(result).toEqual([]);
    });

    it('should apply both scope restriction and search simultaneously', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);
      em.find.mockResolvedValue([]);

      await service.ListDepartments({ semesterId, search: 'CCS' });

      const findCall = em.find.mock.calls[0] as unknown[];
      expect(findCall[1]).toEqual(
        expect.objectContaining({
          id: { $in: [deptId] },
          $and: [
            {
              $or: [
                { code: { $ilike: '%CCS%' } },
                { name: { $ilike: '%CCS%' } },
              ],
            },
          ],
        }),
      );
    });

    it('should handle department with null name', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.find.mockResolvedValue([{ id: deptId, code: 'CCS', name: undefined }]);

      const result = await service.ListDepartments({ semesterId });

      expect(result[0].name).toBeNull();
    });
  });

  // ─── ListPrograms ─────────────────────────────────────────────────

  describe('ListPrograms', () => {
    it('should return all programs for super admin', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const programs = [
        {
          id: programId,
          code: 'BSCS',
          name: 'BS Computer Science',
          department: { id: deptId },
        },
        {
          id: programId2,
          code: 'BSIT',
          name: 'BS Information Technology',
          department: { id: deptId },
        },
      ];
      em.find.mockResolvedValue(programs);

      const result = await service.ListPrograms({ semesterId });

      expect(result).toHaveLength(2);
      expect(result[0].departmentId).toBe(deptId);
    });

    it('should return [] for super admin with non-existent departmentId', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.find.mockResolvedValue([]);

      const result = await service.ListPrograms({
        semesterId,
        departmentId: 'non-existent',
      });

      expect(result).toEqual([]);
      // Verify filter includes the departmentId
      const findCall = em.find.mock.calls[0] as unknown[];
      expect(findCall[1]).toEqual(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          department: expect.objectContaining({ id: 'non-existent' }),
        }),
      );
    });

    it('should return only scoped programs for dean', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      const programs = [
        {
          id: programId,
          code: 'BSCS',
          name: 'BS Computer Science',
          department: { id: deptId },
        },
      ];
      em.find.mockResolvedValue(programs);

      const result = await service.ListPrograms({ semesterId });

      expect(result).toHaveLength(1);
    });

    it('should narrow results with departmentId within scope', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId, deptId2]);
      em.find.mockResolvedValue([]);

      await service.ListPrograms({ semesterId, departmentId: deptId });

      const findCall = em.find.mock.calls[0] as unknown[];
      expect(findCall[1]).toEqual(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          department: expect.objectContaining({ id: deptId }),
        }),
      );
    });

    it('should throw 403 when departmentId is outside dean scope', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      await expect(
        service.ListPrograms({ semesterId, departmentId: deptId2 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should filter by search on code and name (OR)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.find.mockResolvedValue([]);

      await service.ListPrograms({ semesterId, search: 'BS' });

      const findCall = em.find.mock.calls[0] as unknown[];
      expect(findCall[1]).toEqual(
        expect.objectContaining({
          $and: [
            {
              $or: [{ code: { $ilike: '%BS%' } }, { name: { $ilike: '%BS%' } }],
            },
          ],
        }),
      );
    });

    it('should return [] when no programs match', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.find.mockResolvedValue([]);

      const result = await service.ListPrograms({ semesterId });

      expect(result).toEqual([]);
    });

    it('should return [] when dean has empty scope and no departmentId', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([]);

      const result = await service.ListPrograms({ semesterId });

      expect(result).toEqual([]);
      expect(em.find).not.toHaveBeenCalled();
    });
  });

  // ─── ListCourses ──────────────────────────────────────────────────

  describe('ListCourses', () => {
    it('should throw 400 when neither programId nor departmentId is provided', async () => {
      setupSemesterFound();

      await expect(service.ListCourses({ semesterId })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return courses for super admin with departmentId', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const courses = [
        {
          id: 'c1',
          shortname: 'FREAI',
          fullname: 'Free Elective AI',
          program: { id: programId },
          isActive: true,
        },
        {
          id: 'c2',
          shortname: 'ELDNET1',
          fullname: 'Elective Data Networks 1',
          program: { id: programId },
          isActive: false,
        },
      ];
      em.find.mockResolvedValue(courses);

      const result = await service.ListCourses({
        semesterId,
        departmentId: deptId,
      });

      expect(result).toHaveLength(2);
      expect(result[0].programId).toBe(programId);
    });

    it('should return courses for dean with programId within scope', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      em.findOne.mockResolvedValueOnce({
        id: programId,
        department: { id: deptId },
      });

      const courses = [
        {
          id: 'c1',
          shortname: 'FREAI',
          fullname: 'Free Elective AI',
          program: { id: programId },
          isActive: true,
        },
      ];
      em.find.mockResolvedValue(courses);

      const result = await service.ListCourses({
        semesterId,
        programId,
      });

      expect(result).toHaveLength(1);
    });

    it('should throw 403 when dean provides programId outside scope', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      em.findOne.mockResolvedValueOnce({
        id: programId,
        department: { id: deptId2 },
      });

      await expect(
        service.ListCourses({ semesterId, programId }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw 400 when departmentId + programId mismatch', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      em.findOne.mockResolvedValueOnce({
        id: programId,
        department: { id: deptId2 },
      });

      await expect(
        service.ListCourses({
          semesterId,
          departmentId: deptId,
          programId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw 404 when programId not found', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      em.findOne.mockResolvedValueOnce(null);

      await expect(
        service.ListCourses({ semesterId, programId }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should filter by search on shortname and fullname (OR)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.find.mockResolvedValue([]);

      await service.ListCourses({
        semesterId,
        departmentId: deptId,
        search: 'NET',
      });

      const findCall = em.find.mock.calls[0] as unknown[];
      expect(findCall[1]).toEqual(
        expect.objectContaining({
          $and: [
            {
              $or: [
                { shortname: { $ilike: '%NET%' } },
                { fullname: { $ilike: '%NET%' } },
              ],
            },
          ],
        }),
      );
    });

    it('should include inactive courses (isActive: false) in results', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const courses = [
        {
          id: 'c1',
          shortname: 'ACTIVE',
          fullname: 'Active Course',
          program: { id: programId },
          isActive: true,
        },
        {
          id: 'c2',
          shortname: 'INACTIVE',
          fullname: 'Inactive Course',
          program: { id: programId },
          isActive: false,
        },
      ];
      em.find.mockResolvedValue(courses);

      const result = await service.ListCourses({
        semesterId,
        departmentId: deptId,
      });

      expect(result).toHaveLength(2);
      expect(result[0].isActive).toBe(true);
      expect(result[1].isActive).toBe(false);

      // Verify no isActive filter was applied
      const findCall = em.find.mock.calls[0] as unknown[];
      expect(findCall[1]).not.toHaveProperty('isActive');
    });

    it('should throw 403 when departmentId is outside dean scope', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      await expect(
        service.ListCourses({ semesterId, departmentId: deptId2 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw 403 when only programId provided and program department is outside scope', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      em.findOne.mockResolvedValueOnce({
        id: programId,
        department: { id: deptId2 },
      });

      await expect(
        service.ListCourses({ semesterId, programId }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return [] when no courses match', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.find.mockResolvedValue([]);

      const result = await service.ListCourses({
        semesterId,
        departmentId: deptId,
      });

      expect(result).toEqual([]);
    });

    it('should throw 404 for non-existent semesterId', async () => {
      em.findOne.mockResolvedValueOnce(null);

      await expect(
        service.ListCourses({ semesterId, departmentId: deptId }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return [] when dean has empty scope with departmentId', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([]);

      await expect(
        service.ListCourses({ semesterId, departmentId: deptId }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw 403 when dean has empty scope with programId only', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([]);

      em.findOne.mockResolvedValueOnce({
        id: programId,
        department: { id: deptId },
      });

      await expect(
        service.ListCourses({ semesterId, programId }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return courses when both departmentId and programId are valid and match', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      em.findOne.mockResolvedValueOnce({
        id: programId,
        department: { id: deptId },
      });

      const courses = [
        {
          id: 'c1',
          shortname: 'FREAI',
          fullname: 'Free Elective AI',
          program: { id: programId },
          isActive: true,
        },
      ];
      em.find.mockResolvedValue(courses);

      const result = await service.ListCourses({
        semesterId,
        departmentId: deptId,
        programId,
      });

      expect(result).toHaveLength(1);
      expect(result[0].shortname).toBe('FREAI');

      // Verify filter includes both constraints
      const findCall = em.find.mock.calls[0] as unknown[];
      expect(findCall[1]).toEqual(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          program: expect.objectContaining({ id: programId }),
        }),
      );
    });
  });
});
