/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { QuestionnaireService } from '../questionnaire.service';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import {
  Questionnaire,
  QuestionnaireVersion,
  QuestionnaireSubmission,
  QuestionnaireDraft,
  Enrollment,
} from '../../../../entities/index.entity';
import { QuestionnaireSchemaValidator } from '../questionnaire-schema.validator';
import { ScoringService } from '../scoring.service';
import { EntityManager } from '@mikro-orm/postgresql';
import { CacheService } from '../../../common/cache/cache.service';
import { AnalysisService } from '../../../analysis/analysis.service';
import { CurrentUserService } from '../../../common/cls/current-user.service';
import {
  QuestionnaireStatus,
  QuestionnaireType,
} from '../../lib/questionnaire.types';

describe('QuestionnaireService - Types & Versions', () => {
  let service: QuestionnaireService;
  let questionnaireRepo: any;
  let versionRepo: any;

  beforeEach(async () => {
    const createMockRepo = () => ({
      create: jest.fn().mockImplementation((data: Record<string, unknown>) => ({
        ...data,
        answers: { add: jest.fn() },
      })),
      findOne: jest.fn(),
      findAll: jest.fn(),
      find: jest.fn(),
    });

    const questionnaireRepoMock = createMockRepo();
    const versionRepoMock = createMockRepo();

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
          useValue: createMockRepo(),
        },
        {
          provide: getRepositoryToken(QuestionnaireDraft),
          useValue: { ...createMockRepo(), find: jest.fn() },
        },
        {
          provide: getRepositoryToken(Enrollment),
          useValue: createMockRepo(),
        },
        {
          provide: QuestionnaireSchemaValidator,
          useValue: { validate: jest.fn() },
        },
        {
          provide: ScoringService,
          useValue: { calculateScores: jest.fn() },
        },
        {
          provide: EntityManager,
          useValue: {
            persist: jest.fn(),
            flush: jest.fn(),
            findOne: jest.fn(),
            upsert: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: AnalysisService,
          useValue: { EnqueueJob: jest.fn() },
        },
        {
          provide: CurrentUserService,
          useValue: {
            getOrFail: jest.fn().mockReturnValue({ id: 'test-user' }),
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
      ],
    }).compile();

    service = module.get<QuestionnaireService>(QuestionnaireService);
    questionnaireRepo = module.get(getRepositoryToken(Questionnaire));
    versionRepo = module.get(getRepositoryToken(QuestionnaireVersion));
  });

  describe('getQuestionnaireTypes', () => {
    it('should return all enum values even when only some have entities', async () => {
      questionnaireRepo.findAll.mockResolvedValue([
        {
          id: 'q1',
          title: 'Faculty In Classroom Eval',
          type: QuestionnaireType.FACULTY_IN_CLASSROOM,
          status: QuestionnaireStatus.ACTIVE,
        },
      ]);

      const result = await service.getQuestionnaireTypes();

      expect(result).toHaveLength(3);
      expect(result.map((r: any) => r.type)).toEqual(
        Object.values(QuestionnaireType),
      );
    });

    it('should map existing questionnaire data correctly', async () => {
      questionnaireRepo.findAll.mockResolvedValue([
        {
          id: 'q1',
          title: 'Faculty In Classroom Eval',
          type: QuestionnaireType.FACULTY_IN_CLASSROOM,
          status: QuestionnaireStatus.ACTIVE,
        },
        {
          id: 'q2',
          title: 'Faculty Feedback Form',
          type: QuestionnaireType.FACULTY_FEEDBACK,
          status: QuestionnaireStatus.DRAFT,
        },
      ]);

      const result = await service.getQuestionnaireTypes();

      const inClassroom = result.find(
        (r: any) => r.type === QuestionnaireType.FACULTY_IN_CLASSROOM,
      );
      expect(inClassroom).toEqual({
        type: QuestionnaireType.FACULTY_IN_CLASSROOM,
        questionnaireId: 'q1',
        title: 'Faculty In Classroom Eval',
        status: QuestionnaireStatus.ACTIVE,
      });

      const outOfClassroom = result.find(
        (r: any) => r.type === QuestionnaireType.FACULTY_OUT_OF_CLASSROOM,
      );
      expect(outOfClassroom).toEqual({
        type: QuestionnaireType.FACULTY_OUT_OF_CLASSROOM,
        questionnaireId: null,
        title: null,
        status: null,
      });

      const feedback = result.find(
        (r: any) => r.type === QuestionnaireType.FACULTY_FEEDBACK,
      );
      expect(feedback).toEqual({
        type: QuestionnaireType.FACULTY_FEEDBACK,
        questionnaireId: 'q2',
        title: 'Faculty Feedback Form',
        status: QuestionnaireStatus.DRAFT,
      });
    });
  });

  describe('getVersionsByType', () => {
    it('should return versions in DESC order', async () => {
      const mockQuestionnaire = {
        id: 'q1',
        title: 'Faculty In Classroom Eval',
        type: QuestionnaireType.FACULTY_IN_CLASSROOM,
      };

      questionnaireRepo.findOne.mockResolvedValue(mockQuestionnaire);
      versionRepo.find.mockResolvedValue([
        {
          id: 'v2',
          versionNumber: 2,
          status: QuestionnaireStatus.ACTIVE,
          isActive: true,
          publishedAt: new Date('2026-02-01'),
          createdAt: new Date('2026-02-01'),
        },
        {
          id: 'v1',
          versionNumber: 1,
          status: QuestionnaireStatus.DEPRECATED,
          isActive: false,
          publishedAt: new Date('2026-01-01'),
          createdAt: new Date('2026-01-01'),
        },
      ]);

      const result = await service.getVersionsByType(
        QuestionnaireType.FACULTY_IN_CLASSROOM,
      );

      expect(result.questionnaireId).toBe('q1');
      expect(result.questionnaireTitle).toBe('Faculty In Classroom Eval');
      expect(result.type).toBe(QuestionnaireType.FACULTY_IN_CLASSROOM);
      expect(result.versions).toHaveLength(2);
      expect(result.versions[0].versionNumber).toBe(2);
      expect(result.versions[1].versionNumber).toBe(1);

      expect(versionRepo.find).toHaveBeenCalledWith(
        { questionnaire: mockQuestionnaire },
        {
          orderBy: { versionNumber: 'DESC' },
          fields: [
            'id',
            'versionNumber',
            'status',
            'isActive',
            'publishedAt',
            'createdAt',
          ],
        },
      );
    });

    it('should return empty versions when no questionnaire exists for type', async () => {
      questionnaireRepo.findOne.mockResolvedValue(null);

      const result = await service.getVersionsByType(
        QuestionnaireType.FACULTY_FEEDBACK,
      );

      expect(result.questionnaireId).toBeNull();
      expect(result.questionnaireTitle).toBeNull();
      expect(result.type).toBe(QuestionnaireType.FACULTY_FEEDBACK);
      expect(result.versions).toEqual([]);
    });
  });
});
