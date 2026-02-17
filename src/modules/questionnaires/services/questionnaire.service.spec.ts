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
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../auth/roles.enum';
import { EnrollmentRole, QuestionnaireStatus } from '../questionnaire.types';

describe('QuestionnaireService', () => {
  let service: QuestionnaireService;
  let em: EntityManager;
  let submissionRepo: jest.Mocked<EntityRepository<QuestionnaireSubmission>>;
  let enrollmentRepo: jest.Mocked<EntityRepository<Enrollment>>;
  let versionRepo: jest.Mocked<EntityRepository<QuestionnaireVersion>>;
  let questionnaireRepo: jest.Mocked<EntityRepository<Questionnaire>>;

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

    const questionnaireRepoMock = createMockRepo();
    const versionRepoMock = createMockRepo();
    const submissionRepoMock = createMockRepo();
    const enrollmentRepoMock = createMockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionnaireService,
        {
          provide: getRepositoryToken(Questionnaire),
          useValue: questionnaireRepoMock,
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
    questionnaireRepo = module.get(getRepositoryToken(Questionnaire));
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
      versionRepo.findOne.mockResolvedValue(mockVersion as any);
      (em.findOne as jest.Mock).mockImplementation((entity, id) => {
        if (entity === User && id === RESPONDENT_ID) return mockRespondent;
        if (entity === User && id === FACULTY_ID) return mockFaculty;
        if (entity === Semester && id === SEMESTER_ID) return mockSemester;
        if (entity === Course && id === COURSE_ID) return mockCourse;
        return null;
      });
    });

    it('should throw NotFoundException if version is not found', async () => {
      versionRepo.findOne.mockResolvedValue(null);
      await expect(service.submitQuestionnaire(mockData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if respondent is not found', async () => {
      (em.findOne as jest.Mock).mockImplementation((entity, id) => {
        if (entity === User && id === RESPONDENT_ID) return null;
        if (entity === User && id === FACULTY_ID) return mockFaculty;
        if (entity === Semester && id === SEMESTER_ID) return mockSemester;
        if (entity === Course && id === COURSE_ID) return mockCourse;
        return null;
      });
      await expect(service.submitQuestionnaire(mockData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if faculty is not found', async () => {
      (em.findOne as jest.Mock).mockImplementation((entity, id) => {
        if (entity === User && id === RESPONDENT_ID) return mockRespondent;
        if (entity === User && id === FACULTY_ID) return null;
        if (entity === Semester && id === SEMESTER_ID) return mockSemester;
        if (entity === Course && id === COURSE_ID) return mockCourse;
        return null;
      });
      await expect(service.submitQuestionnaire(mockData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if semester is not found', async () => {
      (em.findOne as jest.Mock).mockImplementation((entity, id) => {
        if (entity === User && id === RESPONDENT_ID) return mockRespondent;
        if (entity === User && id === FACULTY_ID) return mockFaculty;
        if (entity === Semester && id === SEMESTER_ID) return null;
        if (entity === Course && id === COURSE_ID) return mockCourse;
        return null;
      });
      await expect(service.submitQuestionnaire(mockData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if course is not found', async () => {
      (em.findOne as jest.Mock).mockImplementation((entity, id) => {
        if (entity === User && id === RESPONDENT_ID) return mockRespondent;
        if (entity === User && id === FACULTY_ID) return mockFaculty;
        if (entity === Semester && id === SEMESTER_ID) return mockSemester;
        if (entity === Course && id === COURSE_ID) return null;
        return null;
      });
      await expect(service.submitQuestionnaire(mockData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if version is inactive', async () => {
      versionRepo.findOne.mockResolvedValue({
        ...mockVersion,
        isActive: false,
      } as any);
      await expect(service.submitQuestionnaire(mockData)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if course does not belong to semester', async () => {
      const mismatchedSemester = { ...mockSemester, id: 's2' };
      (em.findOne as jest.Mock).mockImplementation((entity, id) => {
        if (entity === User && id === RESPONDENT_ID) return mockRespondent;
        if (entity === User && id === FACULTY_ID) return mockFaculty;
        if (entity === Semester && id === 's2') return mismatchedSemester;
        if (entity === Course && id === COURSE_ID) return mockCourse; // Course belongs to s1
        return null;
      });
      const mismatchedData = { ...mockData, semesterId: 's2' };
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
      versionRepo.findOne.mockResolvedValue(requiredCommentVersion as any);
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
      (em.findOne as jest.Mock).mockImplementation((entity, id) => {
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

  describe('DeprecateVersion', () => {
    it('should throw NotFoundException if version is not found', async () => {
      versionRepo.findOne.mockResolvedValue(null);
      await expect(service.DeprecateVersion('v1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if version is already deprecated', async () => {
      versionRepo.findOne.mockResolvedValue({
        id: 'v1',
        status: QuestionnaireStatus.DEPRECATED,
        questionnaire: { id: 'q1' },
      } as any);
      await expect(service.DeprecateVersion('v1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully deprecate a version', async () => {
      const mockVersion = {
        id: 'v1',
        status: QuestionnaireStatus.ACTIVE,
        isActive: true,
        questionnaire: { id: 'q1' },
      };
      versionRepo.findOne.mockResolvedValue(mockVersion as any);

      const result = await service.DeprecateVersion('v1');

      expect(result.status).toBe(QuestionnaireStatus.DEPRECATED);
      expect(result.isActive).toBe(false);
      expect(em.persist).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });
  });

  describe('CreateVersion', () => {
    const mockSchema = {
      meta: {
        questionnaireType: 'FACULTY_IN_CLASSROOM',
        scoringModel: 'SECTION_WEIGHTED',
        version: 1,
        maxScore: 5,
      },
      sections: [],
    };

    it('should throw NotFoundException if questionnaire is not found', async () => {
      questionnaireRepo.findOne.mockResolvedValue(null);
      await expect(
        service.CreateVersion('q1', mockSchema as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if draft version already exists', async () => {
      questionnaireRepo.findOne.mockResolvedValue({ id: 'q1' } as any);
      versionRepo.findOne.mockResolvedValue({
        id: 'v1',
        status: QuestionnaireStatus.DRAFT,
      } as any);

      await expect(
        service.CreateVersion('q1', mockSchema as any),
      ).rejects.toThrow(ConflictException);
    });

    it('should create version with sequential version number', async () => {
      questionnaireRepo.findOne.mockResolvedValue({ id: 'q1' } as any);
      versionRepo.findOne
        .mockResolvedValueOnce(null) // No existing draft
        .mockResolvedValueOnce({ versionNumber: 2 } as any); // Latest version is v2

      const result = await service.CreateVersion('q1', mockSchema as any);

      expect(result.versionNumber).toBe(3);
      expect(result.status).toBe(QuestionnaireStatus.DRAFT);
      expect(em.persist).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });

    it('should create first version with versionNumber 1', async () => {
      questionnaireRepo.findOne.mockResolvedValue({ id: 'q1' } as any);
      versionRepo.findOne.mockResolvedValue(null); // No existing versions

      const result = await service.CreateVersion('q1', mockSchema as any);

      expect(result.versionNumber).toBe(1);
      expect(result.status).toBe(QuestionnaireStatus.DRAFT);
    });
  });

  describe('GetLatestActiveVersion', () => {
    it('should throw NotFoundException if questionnaire is not found', async () => {
      questionnaireRepo.findOne.mockResolvedValue(null);
      await expect(service.GetLatestActiveVersion('q1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return the active version', async () => {
      questionnaireRepo.findOne.mockResolvedValue({ id: 'q1' } as any);
      const activeVersion = { id: 'v1', isActive: true };
      versionRepo.findOne.mockResolvedValue(activeVersion as any);

      const result = await service.GetLatestActiveVersion('q1');

      expect(result).toEqual(activeVersion);
    });

    it('should return null if no active version exists', async () => {
      questionnaireRepo.findOne.mockResolvedValue({ id: 'q1' } as any);
      versionRepo.findOne.mockResolvedValue(null);

      const result = await service.GetLatestActiveVersion('q1');

      expect(result).toBeNull();
    });
  });

  describe('PublishVersion', () => {
    it('should throw NotFoundException if version is not found', async () => {
      versionRepo.findOne.mockResolvedValue(null);
      await expect(service.PublishVersion('v1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if version is already published', async () => {
      versionRepo.findOne.mockResolvedValue({
        id: 'v1',
        publishedAt: new Date(),
        questionnaire: { id: 'q1' },
      } as any);
      await expect(service.PublishVersion('v1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should deprecate current active version when publishing new one', async () => {
      const currentActive = {
        id: 'v1',
        isActive: true,
        status: QuestionnaireStatus.ACTIVE,
      };
      const newVersion = {
        id: 'v2',
        publishedAt: null,
        isActive: false,
        status: QuestionnaireStatus.DRAFT,
        schemaSnapshot: { sections: [] },
        questionnaire: { id: 'q1', status: QuestionnaireStatus.DRAFT },
      };

      versionRepo.findOne
        .mockResolvedValueOnce(newVersion as any) // Find version to publish
        .mockResolvedValueOnce(currentActive as any); // Find current active

      await service.PublishVersion('v2');

      expect(currentActive.isActive).toBe(false);
      expect(currentActive.status).toBe(QuestionnaireStatus.DEPRECATED);
      expect(newVersion.isActive).toBe(true);
      expect(newVersion.status).toBe(QuestionnaireStatus.ACTIVE);
      expect(newVersion.questionnaire.status).toBe(QuestionnaireStatus.ACTIVE);
    });
  });
});
