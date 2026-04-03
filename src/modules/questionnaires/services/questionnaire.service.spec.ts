/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { env } from 'src/configurations/env';
import { Test, TestingModule } from '@nestjs/testing';
import { QuestionnaireService } from './questionnaire.service';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import {
  Questionnaire,
  QuestionnaireType,
  QuestionnaireVersion,
  QuestionnaireSubmission,
  QuestionnaireDraft,
  Enrollment,
  User,
  Semester,
  Course,
} from '../../../entities/index.entity';
import { QuestionnaireSchemaValidator } from './questionnaire-schema.validator';
import { ScoringService } from './scoring.service';
import { EntityManager } from '@mikro-orm/postgresql';
import { CacheService } from '../../common/cache/cache.service';
import { CacheNamespace } from '../../common/cache/cache-namespaces';
import { AnalysisService } from '../../analysis/analysis.service';
import { CurrentUserService } from '../../common/cls/current-user.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../auth/roles.enum';
import {
  EnrollmentRole,
  QuestionnaireStatus,
} from '../lib/questionnaire.types';
import UnitOfWork from '../../common/unit-of-work';

describe('QuestionnaireService', () => {
  let service: QuestionnaireService;
  let em: EntityManager;
  let submissionRepo: jest.Mocked<EntityRepository<QuestionnaireSubmission>>;
  let draftRepo: jest.Mocked<EntityRepository<QuestionnaireDraft>>;
  let enrollmentRepo: jest.Mocked<EntityRepository<Enrollment>>;
  let versionRepo: jest.Mocked<EntityRepository<QuestionnaireVersion>>;
  let questionnaireRepo: jest.Mocked<EntityRepository<Questionnaire>>;
  let analysisService: { EnqueueJob: jest.Mock };
  let cacheService: {
    invalidateNamespace: jest.Mock;
    invalidateNamespaces: jest.Mock;
  };
  let mockTransactionalEm: { findOne: jest.Mock; create: jest.Mock };

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
    const draftRepoMock = {
      ...createMockRepo(),
      find: jest.fn(),
    };
    const enrollmentRepoMock = createMockRepo();

    mockTransactionalEm = {
      findOne: jest.fn(),
      create: jest
        .fn()
        .mockImplementation((_: unknown, data: Record<string, unknown>) => ({
          ...data,
          id: 'new-version-id',
        })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionnaireService,
        {
          provide: getRepositoryToken(Questionnaire),
          useValue: questionnaireRepoMock,
        },
        {
          provide: getRepositoryToken(QuestionnaireType),
          useValue: createMockRepo(),
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
          provide: getRepositoryToken(QuestionnaireDraft),
          useValue: draftRepoMock,
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
            find: jest.fn(),
            nativeDelete: jest.fn(),
            upsert: jest.fn(),
            create: jest
              .fn()
              .mockImplementation(
                (_: unknown, data: Record<string, unknown>) => data,
              ),
          },
        },
        {
          provide: CacheService,
          useValue: {
            wrap: jest
              .fn()
              .mockImplementation(
                (_ns: string, _key: string, fn: () => Promise<unknown>) => fn(),
              ),
            invalidateNamespace: jest.fn(),
            invalidateNamespaces: jest.fn(),
          },
        },
        {
          provide: AnalysisService,
          useValue: {
            EnqueueJob: jest.fn().mockResolvedValue('mock-job-id'),
          },
        },
        {
          provide: UnitOfWork,
          useValue: {
            runInTransaction: jest
              .fn()
              // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
              .mockImplementation((cb) => cb(mockTransactionalEm)),
          },
        },
        {
          provide: CurrentUserService,
          useValue: {
            getOrFail: jest.fn().mockReturnValue({ id: RESPONDENT_ID }),
          },
        },
      ],
    }).compile();

    service = module.get<QuestionnaireService>(QuestionnaireService);
    em = module.get<EntityManager>(EntityManager);
    submissionRepo = module.get(getRepositoryToken(QuestionnaireSubmission));
    draftRepo = module.get(getRepositoryToken(QuestionnaireDraft));
    enrollmentRepo = module.get(getRepositoryToken(Enrollment));
    versionRepo = module.get(getRepositoryToken(QuestionnaireVersion));
    questionnaireRepo = module.get(getRepositoryToken(Questionnaire));
    analysisService = module.get(AnalysisService);
    cacheService = module.get(CacheService);
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
      questionnaire: {
        status: QuestionnaireStatus.ACTIVE,
        type: { code: 'T1' },
      },
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
      expect(result.faculty).toBe('Faculty Name');
      expect(cacheService.invalidateNamespace).toHaveBeenCalledWith(
        CacheNamespace.ENROLLMENTS_ME,
      );
    });

    it('should enqueue embedding job when submission has qualitative comment and worker URL is configured', async () => {
      enrollmentRepo.findOne.mockResolvedValue({ isActive: true } as any);
      submissionRepo.findOne.mockResolvedValue(null);

      const dataWithComment = {
        ...mockData,
        qualitativeComment: 'Great professor, very helpful and knowledgeable.',
      };

      // Temporarily set env.EMBEDDINGS_WORKER_URL for this test
      const originalUrl = env.EMBEDDINGS_WORKER_URL;
      (env as Record<string, unknown>).EMBEDDINGS_WORKER_URL =
        'http://mock-worker:8000/embed';
      try {
        await service.submitQuestionnaire(dataWithComment);
        expect(analysisService.EnqueueJob).toHaveBeenCalledTimes(1);
      } finally {
        (env as Record<string, unknown>).EMBEDDINGS_WORKER_URL = originalUrl;
      }
    });

    it('should not enqueue embedding when no qualitative comment', async () => {
      enrollmentRepo.findOne.mockResolvedValue({ isActive: true } as any);
      submissionRepo.findOne.mockResolvedValue(null);

      await service.submitQuestionnaire(mockData);

      // Without a qualitative comment, no embedding should be enqueued
      // The condition checks for qualitativeComment existence
      expect(analysisService.EnqueueJob).not.toHaveBeenCalled();
    });

    it('should succeed even if embedding dispatch fails', async () => {
      enrollmentRepo.findOne.mockResolvedValue({ isActive: true } as any);
      submissionRepo.findOne.mockResolvedValue(null);
      analysisService.EnqueueJob.mockRejectedValue(
        new Error('Redis unavailable'),
      );

      const dataWithComment = {
        ...mockData,
        qualitativeComment: 'Test comment for embedding failure',
      };

      // Should not throw — embedding is fire-and-forget
      const result = await service.submitQuestionnaire(dataWithComment);
      expect(result).toBeDefined();
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

  describe('CreateVersionFromTemplate', () => {
    const QUESTIONNAIRE_ID = 'q1';
    const SOURCE_VERSION_ID = 'src-v1';

    const mockQuestionnaire = {
      id: QUESTIONNAIRE_ID,
      status: QuestionnaireStatus.ACTIVE,
      type: { id: 't1', name: 'Type 1', code: 'T1' },
    };

    const mockSourceVersion = {
      id: SOURCE_VERSION_ID,
      status: QuestionnaireStatus.ACTIVE,
      questionnaire: { id: QUESTIONNAIRE_ID },
      schemaSnapshot: {
        meta: {
          questionnaireType: 'FACULTY_IN_CLASSROOM',
          scoringModel: 'SECTION_WEIGHTED',
          version: 1,
          maxScore: 5,
        },
        sections: [
          {
            id: 'sec1',
            title: 'Section 1',
            questions: [{ id: 'q1', text: 'How?', required: true }],
          },
        ],
      },
    };

    const mockLatestVersion = { versionNumber: 2 };

    it('should create a new draft version from template (happy path)', async () => {
      mockTransactionalEm.findOne
        .mockResolvedValueOnce(mockQuestionnaire) // questionnaire
        .mockResolvedValueOnce(mockSourceVersion) // source version
        .mockResolvedValueOnce(null) // no existing draft
        .mockResolvedValueOnce(mockLatestVersion); // latest version

      versionRepo.findOne.mockResolvedValue({
        id: 'new-version-id',
        versionNumber: 3,
        status: QuestionnaireStatus.DRAFT,
        questionnaire: mockQuestionnaire,
      } as any);

      const result = await service.CreateVersionFromTemplate(
        QUESTIONNAIRE_ID,
        SOURCE_VERSION_ID,
      );

      expect(result.id).toBe('new-version-id');
      expect(mockTransactionalEm.create).toHaveBeenCalledWith(
        QuestionnaireVersion,
        expect.objectContaining({
          questionnaire: mockQuestionnaire,
          versionNumber: 3,
          status: QuestionnaireStatus.DRAFT,
          isActive: false,
        }),
      );

      // Verify deep copy — schema should match but not be the same reference
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const createCall = mockTransactionalEm.create.mock.calls[0][1];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(createCall.schemaSnapshot).toEqual(
        mockSourceVersion.schemaSnapshot,
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(createCall.schemaSnapshot).not.toBe(
        mockSourceVersion.schemaSnapshot,
      );

      // Verify cache invalidation
      expect(cacheService.invalidateNamespace).toHaveBeenCalledWith(
        CacheNamespace.QUESTIONNAIRE_VERSIONS,
      );

      // Verify post-commit re-fetch
      expect(versionRepo.findOne).toHaveBeenCalledWith('new-version-id', {
        populate: ['questionnaire.type'],
      });
    });

    it('should throw NotFoundException if questionnaire not found', async () => {
      mockTransactionalEm.findOne.mockResolvedValueOnce(null);

      await expect(
        service.CreateVersionFromTemplate(QUESTIONNAIRE_ID, SOURCE_VERSION_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if questionnaire is archived', async () => {
      mockTransactionalEm.findOne.mockResolvedValueOnce({
        ...mockQuestionnaire,
        status: QuestionnaireStatus.ARCHIVED,
      });

      await expect(
        service.CreateVersionFromTemplate(QUESTIONNAIRE_ID, SOURCE_VERSION_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if source version not found', async () => {
      mockTransactionalEm.findOne
        .mockResolvedValueOnce(mockQuestionnaire)
        .mockResolvedValueOnce(null);

      await expect(
        service.CreateVersionFromTemplate(QUESTIONNAIRE_ID, SOURCE_VERSION_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if source belongs to different questionnaire', async () => {
      mockTransactionalEm.findOne
        .mockResolvedValueOnce(mockQuestionnaire)
        .mockResolvedValueOnce({
          ...mockSourceVersion,
          questionnaire: { id: 'different-q' },
        });

      await expect(
        service.CreateVersionFromTemplate(QUESTIONNAIRE_ID, SOURCE_VERSION_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if source is a DRAFT', async () => {
      mockTransactionalEm.findOne
        .mockResolvedValueOnce(mockQuestionnaire)
        .mockResolvedValueOnce({
          ...mockSourceVersion,
          status: QuestionnaireStatus.DRAFT,
        });

      await expect(
        service.CreateVersionFromTemplate(QUESTIONNAIRE_ID, SOURCE_VERSION_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if draft already exists', async () => {
      mockTransactionalEm.findOne
        .mockResolvedValueOnce(mockQuestionnaire)
        .mockResolvedValueOnce(mockSourceVersion)
        .mockResolvedValueOnce({ id: 'existing-draft' }); // existing draft

      await expect(
        service.CreateVersionFromTemplate(QUESTIONNAIRE_ID, SOURCE_VERSION_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('should use versionNumber 1 when no versions exist', async () => {
      mockTransactionalEm.findOne
        .mockResolvedValueOnce(mockQuestionnaire)
        .mockResolvedValueOnce(mockSourceVersion)
        .mockResolvedValueOnce(null) // no existing draft
        .mockResolvedValueOnce(null); // no latest version

      versionRepo.findOne.mockResolvedValue({
        id: 'new-version-id',
        versionNumber: 1,
        status: QuestionnaireStatus.DRAFT,
        questionnaire: mockQuestionnaire,
      } as any);

      await service.CreateVersionFromTemplate(
        QUESTIONNAIRE_ID,
        SOURCE_VERSION_ID,
      );

      expect(mockTransactionalEm.create).toHaveBeenCalledWith(
        QuestionnaireVersion,
        expect.objectContaining({ versionNumber: 1 }),
      );
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

  describe('SaveOrUpdateDraft', () => {
    const mockDraftData = {
      versionId: 'v1',
      facultyId: FACULTY_ID,
      semesterId: SEMESTER_ID,
      courseId: COURSE_ID,
      answers: { q1: 4, q2: 3 },
      qualitativeComment: 'Test comment',
    };

    const mockVersion = { id: 'v1', isActive: true };
    const mockRespondent = { id: RESPONDENT_ID };
    const mockFaculty = { id: FACULTY_ID };
    const mockSemester = { id: SEMESTER_ID };
    const mockCourse = {
      id: COURSE_ID,
      program: {
        department: {
          semester: { id: SEMESTER_ID },
        },
      },
    };

    it('should create a new draft successfully', async () => {
      versionRepo.findOne.mockResolvedValue(mockVersion as any);
      /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      em.findOne
        .mockResolvedValueOnce(mockRespondent as any)
        .mockResolvedValueOnce(mockFaculty as any)
        .mockResolvedValueOnce(mockSemester as any)
        .mockResolvedValueOnce(mockCourse as any);
      /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

      const mockDraft = {
        id: 'd1',
        ...mockDraftData,
        respondent: mockRespondent,
        questionnaireVersion: mockVersion,
        faculty: mockFaculty,
        semester: mockSemester,
        course: mockCourse,
      };

      draftRepo.findOne.mockResolvedValue(null);
      draftRepo.create.mockReturnValue(mockDraft as any);

      const result = await service.SaveOrUpdateDraft(mockDraftData);

      expect(result).toEqual(mockDraft);
      expect(draftRepo.findOne).toHaveBeenCalledWith({
        respondent: mockRespondent,
        questionnaireVersion: mockVersion,
        faculty: mockFaculty,
        semester: mockSemester,
        course: mockCourse,
      });
      expect(draftRepo.create).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });

    it('should update an existing draft', async () => {
      versionRepo.findOne.mockResolvedValue(mockVersion as any);
      /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      em.findOne
        .mockResolvedValueOnce(mockRespondent as any)
        .mockResolvedValueOnce(mockFaculty as any)
        .mockResolvedValueOnce(mockSemester as any)
        .mockResolvedValueOnce(mockCourse as any);
      /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

      const existingDraft = {
        id: 'd1',
        answers: { q1: 1 },
        qualitativeComment: 'Old comment',
      };

      draftRepo.findOne.mockResolvedValue(existingDraft as any);

      await service.SaveOrUpdateDraft(mockDraftData);

      expect(existingDraft.answers).toEqual(mockDraftData.answers);
      expect(existingDraft.qualitativeComment).toBe(
        mockDraftData.qualitativeComment,
      );
      expect(draftRepo.create).not.toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });

    it('should throw NotFoundException if version not found', async () => {
      versionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.SaveOrUpdateDraft(RESPONDENT_ID, mockDraftData),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if version is inactive', async () => {
      versionRepo.findOne.mockResolvedValue({
        id: 'v1',
        isActive: false,
      } as any);

      await expect(
        service.SaveOrUpdateDraft(RESPONDENT_ID, mockDraftData),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if respondent not found', async () => {
      versionRepo.findOne.mockResolvedValue(mockVersion as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      em.findOne.mockResolvedValueOnce(null);

      await expect(
        service.SaveOrUpdateDraft(RESPONDENT_ID, mockDraftData),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if faculty not found', async () => {
      versionRepo.findOne.mockResolvedValue(mockVersion as any);
      /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      em.findOne
        .mockResolvedValueOnce(mockRespondent as any)
        .mockResolvedValueOnce(null);
      /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

      await expect(
        service.SaveOrUpdateDraft(RESPONDENT_ID, mockDraftData),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle draft without courseId', async () => {
      const dataWithoutCourse = { ...mockDraftData, courseId: undefined };
      versionRepo.findOne.mockResolvedValue(mockVersion as any);
      /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      em.findOne
        .mockResolvedValueOnce(mockRespondent as any)
        .mockResolvedValueOnce(mockFaculty as any)
        .mockResolvedValueOnce(mockSemester as any);
      /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

      const mockDraft = {
        id: 'd1',
        ...dataWithoutCourse,
        respondent: mockRespondent,
        questionnaireVersion: mockVersion,
        faculty: mockFaculty,
        semester: mockSemester,
        course: null,
      };

      draftRepo.findOne.mockResolvedValue(null);
      draftRepo.create.mockReturnValue(mockDraft as any);

      const result = await service.SaveOrUpdateDraft(dataWithoutCourse);

      expect(result.course).toBeNull();
      expect(draftRepo.findOne).toHaveBeenCalledWith({
        respondent: mockRespondent,
        questionnaireVersion: mockVersion,
        faculty: mockFaculty,
        semester: mockSemester,
      });
    });
  });

  describe('CheckSubmission', () => {
    const mockQuery = {
      versionId: 'v1',
      facultyId: FACULTY_ID,
      semesterId: SEMESTER_ID,
      courseId: COURSE_ID,
    };

    it('should return submitted true with submittedAt when submission exists', async () => {
      const submittedAt = new Date('2026-03-20T10:00:00Z');
      submissionRepo.findOne.mockResolvedValue({
        id: 'sub1',
        submittedAt,
      } as any);

      const result = await service.CheckSubmission(mockQuery);

      expect(result).toEqual({ submitted: true, submittedAt });
      expect(submissionRepo.findOne).toHaveBeenCalledWith(
        {
          respondent: RESPONDENT_ID,
          questionnaireVersion: 'v1',
          faculty: FACULTY_ID,
          semester: SEMESTER_ID,
          course: COURSE_ID,
        },
        { fields: ['id', 'submittedAt'] },
      );
    });

    it('should return submitted false when no submission exists', async () => {
      submissionRepo.findOne.mockResolvedValue(null);

      const result = await service.CheckSubmission(mockQuery);

      expect(result).toEqual({ submitted: false });
    });

    it('should pass null for course when courseId is undefined', async () => {
      submissionRepo.findOne.mockResolvedValue(null);

      await service.CheckSubmission({ ...mockQuery, courseId: undefined });

      expect(submissionRepo.findOne).toHaveBeenCalledWith(
        {
          respondent: RESPONDENT_ID,
          questionnaireVersion: 'v1',
          faculty: FACULTY_ID,
          semester: SEMESTER_ID,
          course: null,
        },
        { fields: ['id', 'submittedAt'] },
      );
    });
  });

  describe('GetDraft', () => {
    const mockQuery = {
      versionId: 'v1',
      facultyId: FACULTY_ID,
      semesterId: SEMESTER_ID,
      courseId: COURSE_ID,
    };

    it('should return draft when found', async () => {
      const mockDraft = {
        id: 'd1',
        respondent: { id: RESPONDENT_ID },
        questionnaireVersion: { id: 'v1' },
        faculty: { id: FACULTY_ID },
        semester: { id: SEMESTER_ID },
        course: { id: COURSE_ID },
        answers: { q1: 4 },
      };

      draftRepo.findOne.mockResolvedValue(mockDraft as any);

      const result = await service.GetDraft(mockQuery);

      expect(result).toEqual(mockDraft);
      expect(draftRepo.findOne).toHaveBeenCalledWith({
        respondent: RESPONDENT_ID,
        questionnaireVersion: 'v1',
        faculty: FACULTY_ID,
        semester: SEMESTER_ID,
        course: COURSE_ID,
      });
    });

    it('should return null when draft not found', async () => {
      draftRepo.findOne.mockResolvedValue(null);

      const result = await service.GetDraft(mockQuery);

      expect(result).toBeNull();
    });

    it('should handle query without courseId', async () => {
      const queryWithoutCourse = { ...mockQuery, courseId: undefined };
      draftRepo.findOne.mockResolvedValue(null);

      await service.GetDraft(queryWithoutCourse);

      expect(draftRepo.findOne).toHaveBeenCalledWith({
        respondent: RESPONDENT_ID,
        questionnaireVersion: 'v1',
        faculty: FACULTY_ID,
        semester: SEMESTER_ID,
        course: null,
      });
    });
  });

  describe('ListMyDrafts', () => {
    it('should return drafts ordered by updatedAt DESC', async () => {
      const mockDrafts = [
        { id: 'd2', updatedAt: new Date('2024-02-01') },
        { id: 'd1', updatedAt: new Date('2024-01-01') },
      ];

      draftRepo.find.mockResolvedValue(mockDrafts as any);

      const result = await service.ListMyDrafts();

      expect(result).toEqual(mockDrafts);
      expect(draftRepo.find).toHaveBeenCalledWith(
        { respondent: RESPONDENT_ID },
        { orderBy: { updatedAt: 'DESC' } },
      );
    });

    it('should return empty array if no drafts', async () => {
      draftRepo.find.mockResolvedValue([]);

      const result = await service.ListMyDrafts();

      expect(result).toEqual([]);
    });
  });

  describe('GetVersionById', () => {
    it('should throw NotFoundException if version is not found', async () => {
      versionRepo.findOne.mockResolvedValue(null);
      await expect(service.GetVersionById('v1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return version with populated questionnaire', async () => {
      const mockVersion = {
        id: 'v1',
        questionnaire: {
          id: 'q1',
          title: 'Test',
          type: 'FACULTY_IN_CLASSROOM',
        },
        versionNumber: 1,
        status: QuestionnaireStatus.DRAFT,
        isActive: false,
        schemaSnapshot: { sections: [] },
      };
      versionRepo.findOne.mockResolvedValue(mockVersion as any);

      const result = await service.GetVersionById('v1');

      expect(result).toEqual(mockVersion);
      expect(versionRepo.findOne).toHaveBeenCalledWith('v1', {
        populate: ['questionnaire.type'],
      });
    });
  });

  describe('UpdateDraftVersion', () => {
    const mockSchema = {
      meta: {
        questionnaireType: 'FACULTY_IN_CLASSROOM',
        version: 1,
        maxScore: 5,
      },
      sections: [{ id: 'sec1', questions: [] }],
    };

    it('should throw NotFoundException if version is not found', async () => {
      versionRepo.findOne.mockResolvedValue(null);
      await expect(
        service.UpdateDraftVersion('v1', { schema: mockSchema as any }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if version is not a draft', async () => {
      versionRepo.findOne.mockResolvedValue({
        id: 'v1',
        status: QuestionnaireStatus.ACTIVE,
        questionnaire: { id: 'q1', title: 'Test' },
      } as any);

      await expect(
        service.UpdateDraftVersion('v1', { schema: mockSchema as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update schema successfully', async () => {
      const mockVersion = {
        id: 'v1',
        status: QuestionnaireStatus.DRAFT,
        schemaSnapshot: { sections: [] },
        questionnaire: { id: 'q1', title: 'Original Title' },
      };
      versionRepo.findOne.mockResolvedValue(mockVersion as any);

      const result = await service.UpdateDraftVersion('v1', {
        schema: mockSchema as any,
      });

      expect(result.schemaSnapshot).toEqual(mockSchema);
      expect(result.questionnaire.title).toBe('Original Title');
      expect(em.flush).toHaveBeenCalled();
    });

    it('should update both schema and title when title is provided', async () => {
      const mockVersion = {
        id: 'v1',
        status: QuestionnaireStatus.DRAFT,
        schemaSnapshot: { sections: [] },
        questionnaire: { id: 'q1', title: 'Original Title' },
      };
      versionRepo.findOne.mockResolvedValue(mockVersion as any);

      const result = await service.UpdateDraftVersion('v1', {
        schema: mockSchema as any,
        title: 'New Title',
      });

      expect(result.schemaSnapshot).toEqual(mockSchema);
      expect(result.questionnaire.title).toBe('New Title');
      expect(em.flush).toHaveBeenCalled();
    });

    it('should not update title when title is omitted', async () => {
      const mockVersion = {
        id: 'v1',
        status: QuestionnaireStatus.DRAFT,
        schemaSnapshot: { sections: [] },
        questionnaire: { id: 'q1', title: 'Original Title' },
      };
      versionRepo.findOne.mockResolvedValue(mockVersion as any);

      await service.UpdateDraftVersion('v1', {
        schema: mockSchema as any,
      });

      expect(mockVersion.questionnaire.title).toBe('Original Title');
    });
  });

  describe('DeleteDraft', () => {
    it('should soft delete draft successfully', async () => {
      const mockDraft = {
        id: 'd1',
        respondent: { id: RESPONDENT_ID },
        SoftDelete: jest.fn(),
      };

      draftRepo.findOne.mockResolvedValue(mockDraft as any);

      await service.DeleteDraft('d1');

      expect(mockDraft.SoftDelete).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });

    it('should throw NotFoundException if draft not found', async () => {
      draftRepo.findOne.mockResolvedValue(null);

      await expect(service.DeleteDraft('d1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if draft not owned by respondent', async () => {
      draftRepo.findOne.mockResolvedValue(null);

      await expect(service.DeleteDraft('d1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('WipeSubmissions', () => {
    it('should throw NotFoundException if version not found', async () => {
      versionRepo.findOne.mockResolvedValue(null);

      await expect(service.WipeSubmissions('v1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return deletedCount 0 when no submissions exist', async () => {
      versionRepo.findOne.mockResolvedValue({ id: 'v1' } as any);
      (em.find as jest.Mock).mockResolvedValue([]);

      const result = await service.WipeSubmissions('v1');

      expect(result).toEqual({ deletedCount: 0 });
      expect(em.nativeDelete).not.toHaveBeenCalled();
    });

    it('should delete children then submissions and return count', async () => {
      versionRepo.findOne.mockResolvedValue({ id: 'v1' } as any);
      const submissions = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
      (em.find as jest.Mock).mockResolvedValue(submissions);

      const result = await service.WipeSubmissions('v1');

      expect(result).toEqual({ deletedCount: 3 });

      const ids = ['s1', 's2', 's3'];
      const calls = (em.nativeDelete as jest.Mock).mock.calls;
      expect(calls).toHaveLength(5);
      expect(calls[0]).toEqual([
        expect.anything(),
        { submission: { $in: ids } },
      ]);
      expect(calls[1]).toEqual([
        expect.anything(),
        { submission: { $in: ids } },
      ]);
      expect(calls[2]).toEqual([
        expect.anything(),
        { submission: { $in: ids } },
      ]);
      expect(calls[3]).toEqual([
        expect.anything(),
        { submission: { $in: ids } },
      ]);
      expect(calls[4]).toEqual([expect.anything(), { id: { $in: ids } }]);
    });
  });

  describe('UpdateTitle', () => {
    const mockQuestionnaire = {
      id: 'q1',
      title: 'Old Title',
      status: QuestionnaireStatus.ACTIVE,
      type: { id: 't1', name: 'Type 1', code: 'T1' },
    };

    it('should throw NotFoundException if questionnaire not found', async () => {
      questionnaireRepo.findOne.mockResolvedValue(null);
      await expect(service.UpdateTitle('q1', 'New Title')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update title and invalidate caches', async () => {
      questionnaireRepo.findOne.mockResolvedValue({
        ...mockQuestionnaire,
      } as any);

      const result = await service.UpdateTitle('q1', 'New Title');

      expect(result.title).toBe('New Title');
      expect(em.flush).toHaveBeenCalled();
      expect(cacheService.invalidateNamespaces).toHaveBeenCalledWith(
        CacheNamespace.QUESTIONNAIRE_TYPES,
        CacheNamespace.QUESTIONNAIRE_VERSIONS,
      );
    });
  });

  describe('ArchiveQuestionnaire', () => {
    const mockQuestionnaire = {
      id: 'q1',
      title: 'Test',
      status: QuestionnaireStatus.ACTIVE,
      type: { id: 't1', name: 'Type 1', code: 'T1' },
    };

    it('should throw NotFoundException if questionnaire not found', async () => {
      questionnaireRepo.findOne.mockResolvedValue(null);
      await expect(service.ArchiveQuestionnaire('q1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if already archived', async () => {
      questionnaireRepo.findOne.mockResolvedValue({
        ...mockQuestionnaire,
        status: QuestionnaireStatus.ARCHIVED,
      } as any);
      await expect(service.ArchiveQuestionnaire('q1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should set status to ARCHIVED and invalidate caches', async () => {
      const questionnaire = { ...mockQuestionnaire };
      questionnaireRepo.findOne.mockResolvedValue(questionnaire as any);

      const result = await service.ArchiveQuestionnaire('q1');

      expect(result.status).toBe(QuestionnaireStatus.ARCHIVED);
      expect(em.flush).toHaveBeenCalled();
      expect(cacheService.invalidateNamespaces).toHaveBeenCalledWith(
        CacheNamespace.QUESTIONNAIRE_TYPES,
        CacheNamespace.QUESTIONNAIRE_VERSIONS,
      );
    });
  });

  describe('archive guards', () => {
    it('submitQuestionnaire should reject archived questionnaire', async () => {
      versionRepo.findOne.mockResolvedValue({
        id: 'v1',
        isActive: true,
        questionnaire: {
          status: QuestionnaireStatus.ARCHIVED,
          type: { code: 'T1' },
        },
        schemaSnapshot: { meta: { maxScore: 5 }, sections: [] },
      } as any);

      await expect(
        service.submitQuestionnaire({
          versionId: 'v1',
          respondentId: RESPONDENT_ID,
          facultyId: FACULTY_ID,
          semesterId: SEMESTER_ID,
          answers: {},
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('CheckSubmission should return archived true for archived questionnaire', async () => {
      versionRepo.findOne.mockResolvedValue({
        id: 'v1',
        questionnaire: { status: QuestionnaireStatus.ARCHIVED },
      } as any);

      const result = await service.CheckSubmission({
        versionId: 'v1',
        facultyId: FACULTY_ID,
        semesterId: SEMESTER_ID,
      });

      expect(result).toEqual({ submitted: false, archived: true });
    });

    it('CreateVersion should reject archived questionnaire', async () => {
      questionnaireRepo.findOne.mockResolvedValue({
        id: 'q1',
        status: QuestionnaireStatus.ARCHIVED,
        type: { id: 't1' },
      } as any);

      await expect(
        service.CreateVersion('q1', {
          meta: {
            questionnaireType: 'T1',
            scoringModel: 'SECTION_WEIGHTED',
            version: 1,
            maxScore: 5,
          },
          sections: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('PublishVersion should reject archived questionnaire', async () => {
      versionRepo.findOne.mockResolvedValue({
        id: 'v1',
        publishedAt: null,
        questionnaire: {
          status: QuestionnaireStatus.ARCHIVED,
          type: { code: 'T1' },
        },
        schemaSnapshot: { meta: { maxScore: 5 }, sections: [] },
      } as any);

      await expect(service.PublishVersion('v1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('DeprecateVersion should reject archived questionnaire', async () => {
      versionRepo.findOne.mockResolvedValue({
        id: 'v1',
        status: QuestionnaireStatus.ACTIVE,
        questionnaire: {
          status: QuestionnaireStatus.ARCHIVED,
          type: { code: 'T1' },
        },
      } as any);

      await expect(service.DeprecateVersion('v1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
