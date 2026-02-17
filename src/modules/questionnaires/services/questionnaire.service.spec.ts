/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { QuestionnaireService } from './questionnaire.service';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import {
  Questionnaire,
  QuestionnaireVersion,
  QuestionnaireSubmission,
  Enrollment,
  User,
  Semester,
  Course,
} from '../../../entities/index.entity';
import { QuestionnaireSchemaValidator } from './questionnaire-schema.validator';
import { ScoringService } from './scoring.service';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../../auth/roles.enum';
import { EnrollmentRole } from '../questionnaire.types';

describe('QuestionnaireService', () => {
  let service: QuestionnaireService;
  let em: EntityManager;
  let submissionRepo: jest.Mocked<EntityRepository<QuestionnaireSubmission>>;
  let enrollmentRepo: jest.Mocked<EntityRepository<Enrollment>>;
  let versionRepo: jest.Mocked<EntityRepository<QuestionnaireVersion>>;

  const RESPONDENT_ID = 'r1';
  const FACULTY_ID = 'f1';
  const SEMESTER_ID = 's1';
  const COURSE_ID = 'c1';

  beforeEach(async () => {
    const createMockRepo = () => ({
      create: jest.fn().mockImplementation((data: Record<string, unknown>) => ({
        ...data,
        answers: { add: jest.fn() },
      })),
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
    });

    const questionnaireRepo = createMockRepo();
    const versionRepoMock = createMockRepo();
    const submissionRepoMock = createMockRepo();
    const enrollmentRepoMock = createMockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionnaireService,
        {
          provide: getRepositoryToken(Questionnaire),
          useValue: questionnaireRepo,
        },
        {
          provide: getRepositoryToken(QuestionnaireVersion),
          useValue: versionRepoMock,
        },
        {
          provide: getRepositoryToken(QuestionnaireSubmission),
          useValue: submissionRepoMock,
        },
        {
          provide: getRepositoryToken(Enrollment),
          useValue: enrollmentRepoMock,
        },
        {
          provide: QuestionnaireSchemaValidator,
          useValue: { validate: jest.fn() },
        },
        {
          provide: ScoringService,
          useValue: {
            calculateScores: jest.fn().mockReturnValue({
              totalScore: 4,
              normalizedScore: 80,
              sectionBreakdown: [],
            }),
          },
        },
        {
          provide: EntityManager,
          useValue: {
            persist: jest.fn(),
            flush: jest.fn(),
            findOneOrFail: jest.fn(),
            findOne: jest.fn(),
            create: jest
              .fn()
              .mockImplementation(
                (_: unknown, data: Record<string, unknown>) => data,
              ),
          },
        },
      ],
    }).compile();

    service = module.get<QuestionnaireService>(QuestionnaireService);
    em = module.get<EntityManager>(EntityManager);
    submissionRepo = module.get(getRepositoryToken(QuestionnaireSubmission));
    enrollmentRepo = module.get(getRepositoryToken(Enrollment));
    versionRepo = module.get(getRepositoryToken(QuestionnaireVersion));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('submitQuestionnaire', () => {
    const mockData = {
      versionId: 'v1',
      respondentId: RESPONDENT_ID,
      facultyId: FACULTY_ID,
      semesterId: SEMESTER_ID,
      courseId: COURSE_ID,
      answers: { q1: 4 },
    };

    const mockVersion = {
      id: 'v1',
      isActive: true,
      schemaSnapshot: {
        meta: { maxScore: 5 },
        sections: [
          {
            id: 'sec1',
            questions: [{ id: 'q1', required: true, dimensionCode: 'D1' }],
          },
        ],
        qualitativeFeedback: { enabled: true, required: false, maxLength: 100 },
      },
    };

    const mockRespondent = { id: RESPONDENT_ID, roles: [UserRole.STUDENT] };
    const mockFaculty = {
      id: FACULTY_ID,
      userName: 'fac123',
      fullName: 'Faculty Name',
      campus: { code: 'C1', name: 'Campus 1' },
      department: { code: 'D1', name: 'Dept 1' },
      program: { code: 'P1', name: 'Prog 1' },
    };
    const mockSemester = {
      id: SEMESTER_ID,
      code: 'S2026',
      label: 'Spring 2026',
      academicYear: '2025-2026',
      campus: { code: 'C1' },
    };
    const mockCourse = {
      id: COURSE_ID,
      shortname: 'CS101',
      fullname: 'Intro to CS',
      program: {
        department: {
          semester: { id: SEMESTER_ID },
          code: 'D1',
          name: 'Dept 1',
        },
      },
    };

    beforeEach(() => {
      versionRepo.findOneOrFail.mockResolvedValue(mockVersion as any);
      (em.findOneOrFail as jest.Mock).mockImplementation((entity, id) => {
        if (entity === User && id === RESPONDENT_ID) return mockRespondent;
        if (entity === User && id === FACULTY_ID) return mockFaculty;
        if (entity === Semester && id === SEMESTER_ID) return mockSemester;
        if (entity === Course && id === COURSE_ID) return mockCourse;
        return null;
      });
    });

    it('should throw BadRequestException if version is inactive', async () => {
      versionRepo.findOneOrFail.mockResolvedValue({
        ...mockVersion,
        isActive: false,
      } as any);
      await expect(service.submitQuestionnaire(mockData)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if course does not belong to semester', async () => {
      const mismatchedData = { ...mockData, semesterId: 's2' }; // Semester S2
      await expect(service.submitQuestionnaire(mismatchedData)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ForbiddenException if student is not enrolled', async () => {
      enrollmentRepo.findOne.mockResolvedValue(null); // No enrollment
      await expect(service.submitQuestionnaire(mockData)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if faculty is not enrolled', async () => {
      enrollmentRepo.findOne.mockImplementation(((
        criteria: Record<string, any>,
      ) => {
        if (criteria.role === EnrollmentRole.STUDENT)
          return Promise.resolve({ isActive: true });
        return Promise.resolve(null); // Faculty enrollment fails
      }) as any);
      await expect(service.submitQuestionnaire(mockData)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException if qualitative comment is required but missing', async () => {
      const requiredCommentVersion = {
        ...mockVersion,
        schemaSnapshot: {
          ...mockVersion.schemaSnapshot,
          qualitativeFeedback: {
            ...mockVersion.schemaSnapshot.qualitativeFeedback,
            required: true,
          },
        },
      };
      versionRepo.findOneOrFail.mockResolvedValue(
        requiredCommentVersion as any,
      );
      enrollmentRepo.findOne.mockResolvedValue({ isActive: true } as any);
      await expect(service.submitQuestionnaire(mockData)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException if submission already exists', async () => {
      enrollmentRepo.findOne.mockResolvedValue({ isActive: true } as any); // Mock all enrollment checks to pass
      submissionRepo.findOne.mockResolvedValue({ id: 'existing' } as any);
      await expect(service.submitQuestionnaire(mockData)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should successfully submit questionnaire', async () => {
      enrollmentRepo.findOne.mockResolvedValue({ isActive: true } as any); // Mock all enrollment checks to pass
      submissionRepo.findOne.mockResolvedValue(null); // No duplicate

      const result = await service.submitQuestionnaire(mockData);

      expect(result).toBeDefined();
      expect(em.persist).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
      expect(result.facultyEmployeeNumberSnapshot).toBe('fac123');
    });

    it('should allow Dean to submit without enrollment', async () => {
      const deanRespondent = { ...mockRespondent, roles: [UserRole.DEAN] };
      (em.findOneOrFail as jest.Mock).mockImplementation((entity, id) => {
        if (entity === User && id === RESPONDENT_ID) return deanRespondent;
        if (entity === User && id === FACULTY_ID) return mockFaculty;
        if (entity === Semester && id === SEMESTER_ID) return mockSemester;
        if (entity === Course && id === COURSE_ID) return mockCourse;
        return null;
      });

      // Mock only faculty enrollment to pass
      enrollmentRepo.findOne.mockImplementation(((
        criteria: Record<string, any>,
      ) => {
        if (criteria.role === EnrollmentRole.EDITING_TEACHER)
          return Promise.resolve({ isActive: true });
        return Promise.resolve(null); // Respondent enrollment fails
      }) as any);
      submissionRepo.findOne.mockResolvedValue(null);

      const result = await service.submitQuestionnaire(mockData);
      expect(result).toBeDefined();
    });
  });
});
