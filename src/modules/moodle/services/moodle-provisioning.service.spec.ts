import { ConflictException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { MoodleProvisioningService } from './moodle-provisioning.service';
import { MoodleService } from '../moodle.service';
import { MoodleCourseTransformService } from './moodle-course-transform.service';
import { MoodleCsvParserService } from './moodle-csv-parser.service';
import { MoodleCategorySyncService } from './moodle-category-sync.service';

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
});
