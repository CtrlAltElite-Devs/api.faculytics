import { Test, TestingModule } from '@nestjs/testing';
import { QuestionnaireSchemaValidator } from './questionnaire-schema.validator';
import { DimensionRepository } from '../../../repositories/dimension.repository';
import {
  QuestionnaireSchemaSnapshot,
  QuestionnaireType,
  QuestionType,
} from '../questionnaire.types';

describe('QuestionnaireSchemaValidator', () => {
  let validator: QuestionnaireSchemaValidator;
  let dimensionRepository: jest.Mocked<DimensionRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionnaireSchemaValidator,
        {
          provide: DimensionRepository,
          useValue: {
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    validator = module.get<QuestionnaireSchemaValidator>(
      QuestionnaireSchemaValidator,
    );
    dimensionRepository = module.get(DimensionRepository);
  });

  it('should be defined', () => {
    expect(validator).toBeDefined();
  });

  const validSchema: QuestionnaireSchemaSnapshot = {
    meta: {
      questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM,
      scoringModel: 'SECTION_WEIGHTED',
      version: 1,
    },
    sections: [
      {
        id: 's1',
        title: 'Section 1',
        order: 1,
        weight: 100,
        questions: [
          {
            id: 'q1',
            text: 'Question 1',
            type: QuestionType.LIKERT_1_5,
            dimensionCode: 'D1',
            required: true,
            order: 1,
          },
        ],
      },
    ],
  };

  it('should validate a correct schema', async () => {
    dimensionRepository.find.mockResolvedValue([{ code: 'D1' } as any]);
    await expect(validator.validate(validSchema)).resolves.not.toThrow();
  });

  it('should throw if weights do not sum to 100', async () => {
    const invalidSchema: QuestionnaireSchemaSnapshot = JSON.parse(
      JSON.stringify(validSchema),
    ) as QuestionnaireSchemaSnapshot;
    invalidSchema.sections[0].weight = 50;
    dimensionRepository.find.mockResolvedValue([{ code: 'D1' } as any]);
    await expect(validator.validate(invalidSchema)).rejects.toThrow(
      'Sum of leaf section weights must be exactly 100. Current sum: 50',
    );
  });

  it('should throw if a leaf section has no questions', async () => {
    const invalidSchema: QuestionnaireSchemaSnapshot = JSON.parse(
      JSON.stringify(validSchema),
    ) as QuestionnaireSchemaSnapshot;
    invalidSchema.sections[0].questions = [];
    dimensionRepository.find.mockResolvedValue([{ code: 'D1' } as any]);
    await expect(validator.validate(invalidSchema)).rejects.toThrow(
      'Leaf section "Section 1" (ID: s1) must have at least one question.',
    );
  });

  it('should throw if a non-leaf section has a weight', async () => {
    const invalidSchema: QuestionnaireSchemaSnapshot = {
      meta: {
        questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM,
        scoringModel: 'SECTION_WEIGHTED',
        version: 1,
      },
      sections: [
        {
          id: 'parent',
          title: 'Parent',
          order: 1,
          weight: 100,
          sections: [
            {
              id: 'child',
              title: 'Child',
              order: 1,
              weight: 100,
              questions: [
                {
                  id: 'q1',
                  text: 'Q1',
                  type: QuestionType.LIKERT_1_5,
                  dimensionCode: 'D1',
                  required: true,
                  order: 1,
                },
              ],
            },
          ],
        },
      ],
    };
    dimensionRepository.find.mockResolvedValue([{ code: 'D1' } as any]);
    await expect(validator.validate(invalidSchema)).rejects.toThrow(
      'Non-leaf section "Parent" (ID: parent) must NOT have a weight.',
    );
  });

  it('should throw if duplicate IDs exist', async () => {
    const invalidSchema: QuestionnaireSchemaSnapshot = JSON.parse(
      JSON.stringify(validSchema),
    ) as QuestionnaireSchemaSnapshot;
    invalidSchema.sections.push({
      id: 's1', // Duplicate
      title: 'Section 2',
      order: 2,
      weight: 0,
      questions: [],
    });
    await expect(validator.validate(invalidSchema)).rejects.toThrow(
      'Duplicate section ID: s1',
    );
  });

  it('should throw if dimension code is not found', async () => {
    dimensionRepository.find.mockResolvedValue([]);
    await expect(validator.validate(validSchema)).rejects.toThrow(
      'Dimension code "D1" not found or inactive.',
    );
  });
});
