import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { CurrentUserInterceptor } from 'src/modules/common/interceptors/current-user.interceptor';
import {
  auditTestProviders,
  overrideAuditInterceptors,
} from 'src/modules/audit/testing/audit-test.helpers';
import { MoodleProvisioningController } from './moodle-provisioning.controller';
import { MoodleProvisioningService } from '../services/moodle-provisioning.service';

describe('MoodleProvisioningController', () => {
  let controller: MoodleProvisioningController;
  let provisioningService: jest.Mocked<MoodleProvisioningService>;

  beforeEach(async () => {
    const builder = Test.createTestingModule({
      controllers: [MoodleProvisioningController],
      providers: [
        {
          provide: MoodleProvisioningService,
          useValue: {
            ProvisionCategories: jest.fn(),
            PreviewCourses: jest.fn(),
            ExecuteCourseSeeding: jest.fn(),
            PreviewQuickCourse: jest.fn(),
            ExecuteQuickCourse: jest.fn(),
            SeedUsers: jest.fn(),
          },
        },
        ...auditTestProviders(),
      ],
    });

    const module: TestingModule = await overrideAuditInterceptors(
      builder
        .overrideGuard(AuthGuard('jwt'))
        .useValue({ canActivate: () => true })
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => true })
        .overrideInterceptor(CurrentUserInterceptor)
        .useValue({
          intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
            next.handle(),
        }),
    ).compile();

    controller = module.get(MoodleProvisioningController);
    provisioningService = module.get(MoodleProvisioningService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('ProvisionCategories', () => {
    it('should delegate to service', async () => {
      const mockResult = {
        created: 4,
        skipped: 0,
        errors: 0,
        details: [],
        durationMs: 100,
        syncCompleted: true,
      };
      provisioningService.ProvisionCategories.mockResolvedValue(mockResult);

      const result = await controller.ProvisionCategories({
        campuses: ['UCMN'],
        semesters: [1, 2],
        startDate: '2025-08-01',
        endDate: '2026-06-01',
        departments: [{ code: 'CCS', programs: ['BSCS'] }],
      });

      expect(result).toEqual(mockResult);
    });
  });

  describe('PreviewCourses', () => {
    it('should throw when no file provided', async () => {
      await expect(
        controller.PreviewCourses(undefined as any, {
          campus: 'UCMN',
          department: 'CCS',
          startDate: '2025-08-01',
          endDate: '2026-06-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should delegate to service with context', async () => {
      const mockResult = {
        valid: [],
        skipped: [],
        errors: [],
        shortnameNote: 'note',
      };
      provisioningService.PreviewCourses.mockResolvedValue(mockResult);

      const file = {
        buffer: Buffer.from('test'),
        originalname: 'test.csv',
      } as Express.Multer.File;
      const result = await controller.PreviewCourses(file, {
        campus: 'UCMN',
        department: 'CCS',
        startDate: '2025-08-01',
        endDate: '2026-06-01',
      });

      expect(result).toEqual(mockResult);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(provisioningService.PreviewCourses).toHaveBeenCalled();
    });
  });

  describe('SeedUsers', () => {
    it('should delegate to service', async () => {
      const mockResult = {
        usersCreated: 5,
        usersFailed: 0,
        enrolmentsCreated: 10,
        warnings: [],
        durationMs: 500,
      };
      provisioningService.SeedUsers.mockResolvedValue(mockResult);

      const result = await controller.SeedUsers({
        count: 5,
        role: 'student',
        campus: 'ucmn',
        courseIds: [42, 43],
      });

      expect(result).toEqual(mockResult);
    });
  });
});
