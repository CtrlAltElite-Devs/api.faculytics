import { ConflictException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { MoodleProvisioningService } from './moodle-provisioning.service';
import { MoodleService } from '../moodle.service';
import { MoodleCourseTransformService } from './moodle-course-transform.service';
import { MoodleCsvParserService } from './moodle-csv-parser.service';
import { MoodleCategorySyncService } from './moodle-category-sync.service';
import { MoodleCategoryResponse } from '../lib/moodle.types';

describe('MoodleProvisioningService', () => {
  let service: MoodleProvisioningService;
  let moodleService: jest.Mocked<MoodleService>;
  let em: jest.Mocked<EntityManager>;
  let _transformService: MoodleCourseTransformService;
  let csvParser: jest.Mocked<MoodleCsvParserService>;
  let categorySyncService: jest.Mocked<MoodleCategorySyncService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoodleProvisioningService,
        MoodleCourseTransformService,
        {
          provide: MoodleService,
          useValue: {
            GetCategoriesWithMasterKey: jest.fn(),
            GetCoursesByFieldWithMasterKey: jest.fn(),
            CreateCategories: jest.fn(),
            CreateCourses: jest.fn(),
            CreateUsers: jest.fn(),
            EnrolUsers: jest.fn(),
          },
        },
        {
          provide: EntityManager,
          useValue: { findOne: jest.fn() },
        },
        {
          provide: MoodleCsvParserService,
          useValue: { Parse: jest.fn() },
        },
        {
          provide: MoodleCategorySyncService,
          useValue: { SyncAndRebuildHierarchy: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(MoodleProvisioningService);
    moodleService = module.get(MoodleService);
    em = module.get(EntityManager);
    _transformService = module.get(MoodleCourseTransformService);
    csvParser = module.get(MoodleCsvParserService);
    categorySyncService = module.get(MoodleCategorySyncService);
  });

  describe('ProvisionCategories', () => {
    it('should create missing categories and skip existing ones', async () => {
      moodleService.GetCategoriesWithMasterKey.mockResolvedValue([
        {
          id: 1,
          name: 'UCMN',
          parent: 0,
          depth: 1,
          path: '1',
          coursecount: 0,
          visible: 1,
          description: '',
        },
      ] as any);
      moodleService.CreateCategories.mockResolvedValue([
        { id: 10, name: 'S12526' },
      ]);
      categorySyncService.SyncAndRebuildHierarchy.mockResolvedValue({
        status: 'success',
        durationMs: 100,
        fetched: 0,
        inserted: 0,
        updated: 0,
        deactivated: 0,
        errors: 0,
      });

      const result = await service.ProvisionCategories({
        campuses: ['UCMN'],
        semesters: [1],
        startDate: '2025-08-01',
        endDate: '2026-06-01',
        departments: [{ code: 'CCS', programs: ['BSCS'] }],
      });

      expect(result.syncCompleted).toBe(true);
      const skipped = result.details.filter((d) => d.status === 'skipped');
      expect(skipped.length).toBeGreaterThanOrEqual(1);
      expect(skipped[0].name).toBe('UCMN');
    });

    it('should produce correct tag S22526 for sem 2 with same-year dates', async () => {
      moodleService.GetCategoriesWithMasterKey.mockResolvedValue([
        {
          id: 1,
          name: 'UCMN',
          parent: 0,
          depth: 1,
          path: '1',
          coursecount: 0,
          visible: 1,
        },
      ] as any);
      moodleService.CreateCategories.mockResolvedValue([
        { id: 10, name: 'S22526' },
      ]);
      categorySyncService.SyncAndRebuildHierarchy.mockResolvedValue({
        status: 'success',
        durationMs: 100,
        fetched: 0,
        inserted: 0,
        updated: 0,
        deactivated: 0,
        errors: 0,
      });

      const result = await service.ProvisionCategories({
        campuses: ['UCMN'],
        semesters: [2],
        startDate: '2026-01-20',
        endDate: '2026-06-01',
        departments: [],
      });

      const semDetail = result.details.find((d) => d.name.startsWith('S2'));
      expect(semDetail).toBeDefined();
      expect(semDetail!.name).toBe('S22526');
    });

    it('should produce correct tag S12526 for sem 1 with same-year dates', async () => {
      moodleService.GetCategoriesWithMasterKey.mockResolvedValue([
        {
          id: 1,
          name: 'UCMN',
          parent: 0,
          depth: 1,
          path: '1',
          coursecount: 0,
          visible: 1,
        },
      ] as any);
      moodleService.CreateCategories.mockResolvedValue([
        { id: 10, name: 'S12526' },
      ]);
      categorySyncService.SyncAndRebuildHierarchy.mockResolvedValue({
        status: 'success',
        durationMs: 100,
        fetched: 0,
        inserted: 0,
        updated: 0,
        deactivated: 0,
        errors: 0,
      });

      const result = await service.ProvisionCategories({
        campuses: ['UCMN'],
        semesters: [1],
        startDate: '2025-08-01',
        endDate: '2025-12-18',
        departments: [],
      });

      const semDetail = result.details.find((d) => d.name.startsWith('S1'));
      expect(semDetail).toBeDefined();
      expect(semDetail!.name).toBe('S12526');
    });

    it('should set syncCompleted to false when sync fails', async () => {
      moodleService.GetCategoriesWithMasterKey.mockResolvedValue([]);
      moodleService.CreateCategories.mockResolvedValue([
        { id: 1, name: 'UCMN' },
      ]);
      categorySyncService.SyncAndRebuildHierarchy.mockRejectedValue(
        new Error('Sync failed'),
      );

      const result = await service.ProvisionCategories({
        campuses: ['UCMN'],
        semesters: [],
        startDate: '2025-08-01',
        endDate: '2026-06-01',
        departments: [],
      });

      expect(result.syncCompleted).toBe(false);
    });
  });

  describe('PreviewCategories', () => {
    it('should mark all as skipped when full hierarchy exists', async () => {
      moodleService.GetCategoriesWithMasterKey.mockResolvedValue([
        {
          id: 1,
          name: 'UCMN',
          parent: 0,
          depth: 1,
          coursecount: 0,
          visible: 1,
        },
        {
          id: 10,
          name: 'S22526',
          parent: 1,
          depth: 2,
          coursecount: 0,
          visible: 1,
        },
        {
          id: 20,
          name: 'CCS',
          parent: 10,
          depth: 3,
          coursecount: 0,
          visible: 1,
        },
        {
          id: 30,
          name: 'BSCSAI',
          parent: 20,
          depth: 4,
          coursecount: 0,
          visible: 1,
        },
      ] as any);

      const result = await service.PreviewCategories({
        campuses: ['UCMN'],
        semesters: [2],
        startDate: '2025-08-01',
        endDate: '2026-06-01',
        departments: [{ code: 'CCS', programs: ['BSCSAI'] }],
      });

      expect(result.errors).toBe(0);
      expect(result.skipped).toBe(4);
      expect(result.created).toBe(0);
      expect(result.details.every((d) => d.status === 'skipped')).toBe(true);
    });

    it('should mark leaf as created when only program is missing', async () => {
      moodleService.GetCategoriesWithMasterKey.mockResolvedValue([
        {
          id: 1,
          name: 'UCMN',
          parent: 0,
          depth: 1,
          coursecount: 0,
          visible: 1,
        },
        {
          id: 10,
          name: 'S22526',
          parent: 1,
          depth: 2,
          coursecount: 0,
          visible: 1,
        },
        {
          id: 20,
          name: 'CCS',
          parent: 10,
          depth: 3,
          coursecount: 0,
          visible: 1,
        },
      ] as any);

      const result = await service.PreviewCategories({
        campuses: ['UCMN'],
        semesters: [2],
        startDate: '2025-08-01',
        endDate: '2026-06-01',
        departments: [{ code: 'CCS', programs: ['BSCSAI'] }],
      });

      expect(result.skipped).toBe(3);
      expect(result.created).toBe(1);
      const createdItem = result.details.find((d) => d.status === 'created');
      expect(createdItem!.name).toBe('BSCSAI');
    });

    it('should cascade created when parent is missing', async () => {
      moodleService.GetCategoriesWithMasterKey.mockResolvedValue([
        {
          id: 1,
          name: 'UCMN',
          parent: 0,
          depth: 1,
          coursecount: 0,
          visible: 1,
        },
      ] as any);

      const result = await service.PreviewCategories({
        campuses: ['UCMN'],
        semesters: [2],
        startDate: '2025-08-01',
        endDate: '2026-06-01',
        departments: [{ code: 'CCS', programs: ['BSCSAI'] }],
      });

      expect(result.skipped).toBe(1); // campus
      expect(result.created).toBe(3); // semester, dept, program
    });

    it('should not call CreateCategories', async () => {
      moodleService.GetCategoriesWithMasterKey.mockResolvedValue([]);

      await service.PreviewCategories({
        campuses: ['UCMN'],
        semesters: [1],
        startDate: '2025-08-01',
        endDate: '2026-06-01',
        departments: [],
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(moodleService.CreateCategories).not.toHaveBeenCalled();
    });

    it('should not block concurrent preview calls', async () => {
      moodleService.GetCategoriesWithMasterKey.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
      );

      const input = {
        campuses: ['UCMN'],
        semesters: [1],
        startDate: '2025-08-01',
        endDate: '2026-06-01',
        departments: [],
      };

      const [a, b] = await Promise.all([
        service.PreviewCategories(input),
        service.PreviewCategories(input),
      ]);

      expect(a.errors).toBe(0);
      expect(b.errors).toBe(0);
    });
  });

  describe('PreviewCourses', () => {
    it('should transform valid rows and skip semester-0', async () => {
      csvParser.Parse.mockReturnValue({
        rows: [
          {
            courseCode: 'CS101',
            descriptiveTitle: 'Intro',
            program: 'BSCS',
            semester: '1',
          },
        ],
        warnings: [
          {
            rowNumber: 3,
            courseCode: 'CS-EL',
            reason: 'No semester assigned — use Quick Course Create',
          },
        ],
        errors: [],
      });

      em.findOne.mockResolvedValue({ moodleCategoryId: 42 } as any);

      const result = await service.PreviewCourses(Buffer.from(''), {
        campus: 'UCMN',
        department: 'CCS',
        startDate: '2025-08-01',
        endDate: '2026-06-01',
        startYear: '2025',
        endYear: '2026',
        startYY: '25',
        endYY: '26',
      });

      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].categoryId).toBe(42);
      expect(result.skipped).toHaveLength(1);
      expect(result.shortnameNote).toContain('examples');
    });

    it('should flag rows where category is not found', async () => {
      csvParser.Parse.mockReturnValue({
        rows: [
          {
            courseCode: 'CS101',
            descriptiveTitle: 'Intro',
            program: 'BSCS',
            semester: '1',
          },
        ],
        warnings: [],
        errors: [],
      });
      em.findOne.mockResolvedValue(null);

      const result = await service.PreviewCourses(Buffer.from(''), {
        campus: 'UCMN',
        department: 'CCS',
        startDate: '2025-08-01',
        endDate: '2026-06-01',
        startYear: '2025',
        endYear: '2026',
        startYY: '25',
        endYY: '26',
      });

      expect(result.valid).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain('Category not found');
    });
  });

  describe('ExecuteCourseSeeding', () => {
    it('should batch courses and handle partial failures', async () => {
      const batch1Results = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        shortname: `UCMN-S12526-CS${i}-${String(i).padStart(5, '0')}`,
      }));
      moodleService.CreateCourses.mockResolvedValueOnce(
        batch1Results,
      ).mockRejectedValueOnce(new Error('shortnametaken'));

      const rows = Array.from({ length: 51 }, (_, i) => ({
        courseCode: `CS${i}`,
        descriptiveTitle: `Course ${i}`,
        program: 'BSCS',
        semester: '1',
        categoryId: 42,
      }));

      const result = await service.ExecuteCourseSeeding(rows, {
        campus: 'UCMN',
        department: 'CCS',
        startDate: '2025-08-01',
        endDate: '2026-06-01',
        startYear: '2025',
        endYear: '2026',
        startYY: '25',
        endYY: '26',
      });

      expect(result.created).toBe(50);
      expect(result.errors).toBe(1);
    });
  });

  describe('ExecuteQuickCourse', () => {
    it('should create a single course', async () => {
      em.findOne.mockResolvedValue({ moodleCategoryId: 42 } as any);
      moodleService.CreateCourses.mockResolvedValue([
        { id: 100, shortname: 'UCMN-S12526-CS101-12345' },
      ]);

      const result = await service.ExecuteQuickCourse({
        courseCode: 'CS101',
        descriptiveTitle: 'Intro to CS',
        campus: 'UCMN',
        department: 'CCS',
        program: 'BSCS',
        semester: 1,
        startDate: '2025-08-01',
        endDate: '2026-06-01',
      });

      expect(result.created).toBe(1);
      expect(result.details[0].moodleId).toBe(100);
    });

    it('should throw when category not found', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(
        service.ExecuteQuickCourse({
          courseCode: 'CS101',
          descriptiveTitle: 'Intro',
          campus: 'UCMN',
          department: 'CCS',
          program: 'BSCS',
          semester: 1,
          startDate: '2025-08-01',
          endDate: '2026-06-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('SeedUsers', () => {
    it('should create users, handle null enrol response', async () => {
      moodleService.CreateUsers.mockResolvedValue([
        { id: 1, username: 'ucmn-2604101234' },
        { id: 2, username: 'ucmn-2604105678' },
      ]);
      moodleService.EnrolUsers.mockResolvedValue(null);

      const result = await service.SeedUsers({
        count: 2,
        role: 'student',
        campus: 'ucmn',
        courseIds: [42],
      });

      expect(result.usersCreated).toBe(2);
      expect(result.enrolmentsCreated).toBe(2);
    });
  });

  describe('GetCategoryTree', () => {
    it('should build a nested tree from flat categories', async () => {
      const flat: Partial<MoodleCategoryResponse>[] = [
        {
          id: 1,
          name: 'UCMN',
          parent: 0,
          depth: 1,
          coursecount: 0,
          visible: 1,
          sortorder: 10000,
        },
        {
          id: 2,
          name: 'DLSAU',
          parent: 0,
          depth: 1,
          coursecount: 0,
          visible: 1,
          sortorder: 20000,
        },
        {
          id: 3,
          name: '1st Sem 25-26',
          parent: 1,
          depth: 2,
          coursecount: 0,
          visible: 1,
          sortorder: 10001,
        },
        {
          id: 4,
          name: '2nd Sem 25-26',
          parent: 1,
          depth: 2,
          coursecount: 0,
          visible: 1,
          sortorder: 10002,
        },
        {
          id: 5,
          name: 'CCS',
          parent: 3,
          depth: 3,
          coursecount: 0,
          visible: 1,
          sortorder: 10003,
        },
        {
          id: 6,
          name: 'BSCS',
          parent: 5,
          depth: 4,
          coursecount: 8,
          visible: 1,
          sortorder: 10004,
        },
        {
          id: 7,
          name: 'BSIT',
          parent: 5,
          depth: 4,
          coursecount: 5,
          visible: 0,
          sortorder: 10005,
        },
      ];

      moodleService.GetCategoriesWithMasterKey.mockResolvedValue(flat);

      const result = await service.GetCategoryTree();

      // Root level: 2 campus nodes
      expect(result.tree).toHaveLength(2);
      expect(result.tree[0].name).toBe('UCMN');
      expect(result.tree[1].name).toBe('DLSAU');

      // UCMN has 2 semester children
      const ucmn = result.tree[0];
      expect(ucmn.children).toHaveLength(2);
      expect(ucmn.children[0].name).toBe('1st Sem 25-26');
      expect(ucmn.children[1].name).toBe('2nd Sem 25-26');

      // Semester -> Department -> Program nesting
      const firstSem = ucmn.children[0];
      expect(firstSem.children).toHaveLength(1);
      expect(firstSem.children[0].name).toBe('CCS');

      const ccs = firstSem.children[0];
      expect(ccs.children).toHaveLength(2);
      expect(ccs.children[0].name).toBe('BSCS');
      expect(ccs.children[1].name).toBe('BSIT');

      // Metadata
      expect(result.totalCategories).toBe(7);
      expect(new Date(result.fetchedAt).toISOString()).toBe(result.fetchedAt);
    });

    it('should sort children by sortorder ascending, not alphabetical', async () => {
      const flat: Partial<MoodleCategoryResponse>[] = [
        {
          id: 1,
          name: 'Root',
          parent: 0,
          depth: 1,
          coursecount: 0,
          visible: 1,
          sortorder: 10000,
        },
        {
          id: 2,
          name: 'Zebra',
          parent: 1,
          depth: 2,
          coursecount: 0,
          visible: 1,
          sortorder: 100,
        },
        {
          id: 3,
          name: 'Alpha',
          parent: 1,
          depth: 2,
          coursecount: 0,
          visible: 1,
          sortorder: 200,
        },
        {
          id: 4,
          name: 'Middle',
          parent: 1,
          depth: 2,
          coursecount: 0,
          visible: 1,
          sortorder: 150,
        },
      ];

      moodleService.GetCategoriesWithMasterKey.mockResolvedValue(flat);

      const result = await service.GetCategoryTree();
      const children = result.tree[0].children;

      expect(children[0].name).toBe('Zebra');
      expect(children[1].name).toBe('Middle');
      expect(children[2].name).toBe('Alpha');
    });

    it('should only include DTO fields, not sortorder or other extras', async () => {
      const flat: Partial<MoodleCategoryResponse>[] = [
        {
          id: 1,
          name: 'Test',
          parent: 0,
          depth: 1,
          coursecount: 3,
          visible: 1,
          sortorder: 100,
          path: '/1',
          description: 'desc',
          descriptionformat: 1,
        },
      ];

      moodleService.GetCategoriesWithMasterKey.mockResolvedValue(flat);

      const result = await service.GetCategoryTree();
      const node = result.tree[0];

      expect(Object.keys(node).sort()).toEqual([
        'children',
        'coursecount',
        'depth',
        'id',
        'name',
        'visible',
      ]);
    });

    it('should return empty tree for empty category list', async () => {
      moodleService.GetCategoriesWithMasterKey.mockResolvedValue([]);

      const result = await service.GetCategoryTree();

      expect(result.tree).toEqual([]);
      expect(result.totalCategories).toBe(0);
      expect(new Date(result.fetchedAt).toISOString()).toBe(result.fetchedAt);
    });
  });

  describe('GetCoursesByCategoryWithMasterKey', () => {
    it('should map courses to preview DTOs', async () => {
      const courses = [
        {
          id: 101,
          shortname: 'CS101-2526',
          fullname: 'Intro to CS',
          enrolledusercount: 30,
          visible: 1,
          startdate: 1700000000,
          enddate: 1710000000,
          category: 5,
          displayname: 'x',
          hidden: false,
          timemodified: 0,
        },
        {
          id: 102,
          shortname: 'CS102-2526',
          fullname: 'Data Structures',
          enrolledusercount: 25,
          visible: 1,
          startdate: 1700000000,
          enddate: 1710000000,
          category: 5,
          displayname: 'y',
          hidden: false,
          timemodified: 0,
        },
        {
          id: 103,
          shortname: 'CS103-2526',
          fullname: 'Algorithms',
          enrolledusercount: undefined,
          visible: 0,
          startdate: 1700000000,
          enddate: 1710000000,
          category: 5,
          displayname: 'z',
          hidden: false,
          timemodified: 0,
        },
      ];

      moodleService.GetCoursesByFieldWithMasterKey.mockResolvedValue({
        courses,
      });

      const result = await service.GetCoursesByCategoryWithMasterKey(5);

      expect(result.categoryId).toBe(5);
      expect(result.courses).toHaveLength(3);

      const first = result.courses[0];
      expect(first.id).toBe(101);
      expect(first.shortname).toBe('CS101-2526');
      expect(first.fullname).toBe('Intro to CS');
      expect(first.enrolledusercount).toBe(30);
      expect(first.visible).toBe(1);
      expect(first.startdate).toBe(1700000000);
      expect(first.enddate).toBe(1710000000);

      // enrolledusercount may be undefined
      expect(result.courses[2].enrolledusercount).toBeUndefined();
    });

    it('should echo back categoryId with no categoryName', async () => {
      moodleService.GetCoursesByFieldWithMasterKey.mockResolvedValue({
        courses: [],
      });

      const result = await service.GetCoursesByCategoryWithMasterKey(42);

      expect(result.categoryId).toBe(42);
      expect(result.courses).toEqual([]);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((result as any).categoryName).toBeUndefined();
    });
  });

  describe('Concurrency guard', () => {
    it('should throw ConflictException on concurrent operations', async () => {
      moodleService.CreateUsers.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 100)),
      );
      moodleService.EnrolUsers.mockResolvedValue(null);

      const first = service.SeedUsers({
        count: 1,
        role: 'student',
        campus: 'ucmn',
        courseIds: [1],
      });

      await expect(
        service.SeedUsers({
          count: 1,
          role: 'student',
          campus: 'ucmn',
          courseIds: [1],
        }),
      ).rejects.toThrow(ConflictException);

      await first;
    });
  });

  describe('PreviewBulkCourses', () => {
    const mockProgram = {
      id: 'prog-1',
      code: 'BSIT',
      moodleCategoryId: 42,
      department: {
        id: 'dept-1',
        code: 'CCS',
        semester: {
          id: 'sem-1',
          code: 'S12526',
          campus: { id: 'campus-1', code: 'UCMN' },
        },
      },
    };

    const baseDto = {
      semesterId: 'sem-1',
      departmentId: 'dept-1',
      programId: 'prog-1',
      startDate: '2025-08-01',
      endDate: '2025-12-18',
      courses: [
        { courseCode: 'CS101', descriptiveTitle: 'Intro to CS' },
        { courseCode: 'CS102', descriptiveTitle: 'Data Structures' },
      ],
    };

    it('should generate preview rows with correct shortnames and categoryPath', async () => {
      em.findOne.mockResolvedValue(mockProgram);

      const result = await service.PreviewBulkCourses(baseDto);

      expect(result.valid).toHaveLength(2);
      expect(result.skipped).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.valid[0].fullname).toBe('Intro to CS');
      expect(result.valid[0].categoryId).toBe(42);
      expect(result.valid[0].categoryPath).toContain('UCMN');
      expect(result.valid[0].categoryPath).toContain('CCS');
      expect(result.valid[0].categoryPath).toContain('BSIT');
      expect(result.valid[0].shortname).toContain('UCMN');
      expect(result.valid[0].courseCode).toBe('CS101');
    });

    it('should throw BadRequestException when program not found', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(service.PreviewBulkCourses(baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for mismatched departmentId', async () => {
      em.findOne.mockResolvedValue(mockProgram);

      await expect(
        service.PreviewBulkCourses({ ...baseDto, departmentId: 'wrong-dept' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for mismatched semesterId', async () => {
      em.findOne.mockResolvedValue(mockProgram);

      await expect(
        service.PreviewBulkCourses({ ...baseDto, semesterId: 'wrong-sem' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for malformed semester code', async () => {
      const badProgram = {
        ...mockProgram,
        department: {
          ...mockProgram.department,
          semester: {
            ...mockProgram.department.semester,
            code: 'INVALID',
          },
        },
      };
      em.findOne.mockResolvedValue(badProgram);

      await expect(service.PreviewBulkCourses(baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for unprovisioned category', async () => {
      em.findOne.mockResolvedValue({ ...mockProgram, moodleCategoryId: 0 });

      await expect(service.PreviewBulkCourses(baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for duplicate course codes', async () => {
      em.findOne.mockResolvedValue(mockProgram);

      await expect(
        service.PreviewBulkCourses({
          ...baseDto,
          courses: [
            { courseCode: 'CS101', descriptiveTitle: 'A' },
            { courseCode: 'CS101', descriptiveTitle: 'B' },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ExecuteBulkCourses', () => {
    const mockProgram = {
      id: 'prog-1',
      code: 'BSIT',
      moodleCategoryId: 42,
      department: {
        id: 'dept-1',
        code: 'CCS',
        semester: {
          id: 'sem-1',
          code: 'S12526',
          campus: { id: 'campus-1', code: 'UCMN' },
        },
      },
    };

    const baseDto = {
      semesterId: 'sem-1',
      departmentId: 'dept-1',
      programId: 'prog-1',
      startDate: '2025-08-01',
      endDate: '2025-12-18',
      courses: [
        {
          courseCode: 'CS101',
          descriptiveTitle: 'Intro to CS',
          categoryId: 42,
        },
      ],
    };

    it('should create courses and return result', async () => {
      em.findOne.mockResolvedValue(mockProgram);
      moodleService.CreateCourses.mockResolvedValue([
        { id: 1001, shortname: 'UCMN-S12526-CS101-00001' },
      ]);

      const result = await service.ExecuteBulkCourses(baseDto);

      expect(result.created).toBe(1);
      expect(result.errors).toBe(0);
      expect(result.details[0].status).toBe('created');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(moodleService.CreateCourses).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            categoryid: 42,
            fullname: 'Intro to CS',
          }),
        ]),
      );
    });

    it('should throw BadRequestException when program not found', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(service.ExecuteBulkCourses(baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for mismatched hierarchy', async () => {
      em.findOne.mockResolvedValue(mockProgram);

      await expect(
        service.ExecuteBulkCourses({ ...baseDto, departmentId: 'wrong' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use program.moodleCategoryId, not client-supplied categoryId', async () => {
      em.findOne.mockResolvedValue(mockProgram);
      moodleService.CreateCourses.mockResolvedValue([
        { id: 1001, shortname: 'test' },
      ]);

      await service.ExecuteBulkCourses({
        ...baseDto,
        courses: [
          { courseCode: 'CS101', descriptiveTitle: 'A', categoryId: 999 },
        ],
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(moodleService.CreateCourses).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ categoryid: 42 })]),
      );
    });

    it('should release guard after error', async () => {
      em.findOne.mockResolvedValue(mockProgram);
      moodleService.CreateCourses.mockRejectedValue(new Error('Moodle down'));

      const result = await service.ExecuteBulkCourses(baseDto);

      expect(result.errors).toBe(1);
      // Guard should be released -- second call should not throw ConflictException
      em.findOne.mockResolvedValue(mockProgram);
      moodleService.CreateCourses.mockResolvedValue([
        { id: 1, shortname: 'x' },
      ]);
      const result2 = await service.ExecuteBulkCourses(baseDto);
      expect(result2.created).toBe(1);
    });
  });
});
