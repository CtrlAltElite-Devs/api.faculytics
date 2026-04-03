/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QuestionnaireService } from '../questionnaire.service';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import {
  Questionnaire,
  QuestionnaireType,
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
import { QuestionnaireStatus } from '../../lib/questionnaire.types';
import UnitOfWork from '../../../common/unit-of-work';

describe('QuestionnaireService - Types & Versions', () => {
  let service: QuestionnaireService;
  let questionnaireRepo: any;
  let typeRepo: any;
  let versionRepo: any;
  let cacheService: any;

  const mockTypeEntity = {
    id: 'type-1',
    name: 'Faculty In-Classroom',
    code: 'FACULTY_IN_CLASSROOM',
    isSystem: true,
  };

  const mockTypeEntity2 = {
    id: 'type-2',
    name: 'Faculty Feedback',
    code: 'FACULTY_FEEDBACK',
    isSystem: true,
  };

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
    const typeRepoMock = createMockRepo();
    const versionRepoMock = createMockRepo();

    cacheService = {
      wrap: jest
        .fn()
        .mockImplementation(
          (_ns: string, _key: string, fn: () => Promise<unknown>) => fn(),
        ),
      invalidateNamespace: jest.fn(),
      invalidateNamespaces: jest.fn(),
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
          useValue: typeRepoMock,
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
            persist: jest.fn().mockReturnThis(),
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
          provide: UnitOfWork,
          useValue: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            runInTransaction: jest.fn().mockImplementation((cb) =>
              cb({
                findOne: jest.fn(),
                create: jest.fn(),
              }),
            ),
          },
        },
        {
          provide: CacheService,
          useValue: cacheService,
        },
      ],
    }).compile();

    service = module.get<QuestionnaireService>(QuestionnaireService);
    questionnaireRepo = module.get(getRepositoryToken(Questionnaire));
    typeRepo = module.get(getRepositoryToken(QuestionnaireType));
    versionRepo = module.get(getRepositoryToken(QuestionnaireVersion));
  });

  describe('getQuestionnaireTypes', () => {
    it('should return all type entities with questionnaire info', async () => {
      typeRepo.findAll.mockResolvedValue([mockTypeEntity, mockTypeEntity2]);
      questionnaireRepo.findAll.mockResolvedValue([
        {
          id: 'q1',
          title: 'Faculty In Classroom Eval',
          type: mockTypeEntity,
          status: QuestionnaireStatus.ACTIVE,
        },
      ]);

      const result = await service.getQuestionnaireTypes();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'type-1',
        name: 'Faculty In-Classroom',
        code: 'FACULTY_IN_CLASSROOM',
        description: null,
        isSystem: true,
        questionnaireId: 'q1',
        questionnaireTitle: 'Faculty In Classroom Eval',
        questionnaireStatus: QuestionnaireStatus.ACTIVE,
      });
    });

    it('should return null questionnaire info for types without questionnaires', async () => {
      typeRepo.findAll.mockResolvedValue([mockTypeEntity2]);
      questionnaireRepo.findAll.mockResolvedValue([]);

      const result = await service.getQuestionnaireTypes();

      expect(result[0].questionnaireId).toBeNull();
      expect(result[0].questionnaireTitle).toBeNull();
      expect(result[0].questionnaireStatus).toBeNull();
    });
  });

  describe('getVersionsByType', () => {
    it('should return versions in DESC order', async () => {
      const mockQuestionnaire = {
        id: 'q1',
        title: 'Faculty In Classroom Eval',
        type: mockTypeEntity,
      };

      typeRepo.findOne.mockResolvedValue(mockTypeEntity);
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

      const result = await service.getVersionsByType('type-1');

      expect(result.questionnaireId).toBe('q1');
      expect(result.questionnaireTitle).toBe('Faculty In Classroom Eval');
      expect(result.type).toEqual({
        id: 'type-1',
        name: 'Faculty In-Classroom',
        code: 'FACULTY_IN_CLASSROOM',
      });
      expect(result.versions).toHaveLength(2);
      expect(result.versions[0].versionNumber).toBe(2);
      expect(result.versions[1].versionNumber).toBe(1);
    });

    it('should return empty versions when no questionnaire exists for type', async () => {
      typeRepo.findOne.mockResolvedValue(mockTypeEntity2);
      questionnaireRepo.findOne.mockResolvedValue(null);

      const result = await service.getVersionsByType('type-2');

      expect(result.questionnaireId).toBeNull();
      expect(result.questionnaireTitle).toBeNull();
      expect(result.type).toEqual({
        id: 'type-2',
        name: 'Faculty Feedback',
        code: 'FACULTY_FEEDBACK',
      });
      expect(result.versions).toEqual([]);
    });

    it('should throw NotFoundException for non-existent type ID', async () => {
      typeRepo.findOne.mockResolvedValue(null);

      await expect(service.getVersionsByType('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createQuestionnaire', () => {
    it('should create a questionnaire with valid typeId', async () => {
      typeRepo.findOne.mockResolvedValue(mockTypeEntity);
      questionnaireRepo.findOne.mockResolvedValue(null);
      questionnaireRepo.create.mockReturnValue({
        id: 'q-new',
        title: 'New Eval',
        type: mockTypeEntity,
        status: QuestionnaireStatus.DRAFT,
      });

      const result = await service.createQuestionnaire({
        title: 'New Eval',
        typeId: 'type-1',
      });

      expect(result.type).toEqual(mockTypeEntity);
    });

    it('should throw NotFoundException for non-existent type ID', async () => {
      typeRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createQuestionnaire({ title: 'Test', typeId: 'missing' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when type already has a questionnaire', async () => {
      typeRepo.findOne.mockResolvedValue(mockTypeEntity);
      questionnaireRepo.findOne.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createQuestionnaire({ title: 'Test', typeId: 'type-1' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
