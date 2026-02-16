import { Test, TestingModule } from '@nestjs/testing';
import { QuestionnaireService } from './questionnaire.service';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import {
  Questionnaire,
  QuestionnaireVersion,
  QuestionnaireSubmission,
} from '../../../entities/index.entity';
import { QuestionnaireSchemaValidator } from './questionnaire-schema.validator';
import { ScoringService } from './scoring.service';
import { EntityManager } from '@mikro-orm/postgresql';

describe('QuestionnaireService', () => {
  let service: QuestionnaireService;

  beforeEach(async () => {
    const mockRepo = {
      create: jest
        .fn()
        .mockImplementation((data: Record<string, unknown>) => data),
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionnaireService,
        { provide: getRepositoryToken(Questionnaire), useValue: mockRepo },
        {
          provide: getRepositoryToken(QuestionnaireVersion),
          useValue: mockRepo,
        },
        {
          provide: getRepositoryToken(QuestionnaireSubmission),
          useValue: mockRepo,
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
            persistAndFlush: jest.fn(),
            flush: jest.fn(),
            findOneOrFail: jest.fn(),
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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
