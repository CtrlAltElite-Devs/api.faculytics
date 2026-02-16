import { Test, TestingModule } from '@nestjs/testing';
import { ScoringService } from './scoring.service';
import {
  QuestionnaireSchemaSnapshot,
  QuestionnaireType,
  QuestionType,
} from '../questionnaire.types';

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScoringService],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  const schema: QuestionnaireSchemaSnapshot = {
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
        weight: 60,
        questions: [
          {
            id: 'q1',
            text: 'Q1',
            type: QuestionType.LIKERT_1_5,
            dimensionCode: 'D1',
            required: true,
            order: 1,
          },
          {
            id: 'q2',
            text: 'Q2',
            type: QuestionType.LIKERT_1_5,
            dimensionCode: 'D1',
            required: true,
            order: 2,
          },
        ],
      },
      {
        id: 's2',
        title: 'Section 2',
        order: 2,
        weight: 40,
        questions: [
          {
            id: 'q3',
            text: 'Q3',
            type: QuestionType.LIKERT_1_5,
            dimensionCode: 'D2',
            required: true,
            order: 1,
          },
        ],
      },
    ],
  };

  it('should calculate scores correctly', () => {
    const answers = {
      q1: 5,
      q2: 3, // Avg Section 1 = 4
      q3: 4, // Avg Section 2 = 4
    };

    // totalScore = 4 * 0.6 + 4 * 0.4 = 2.4 + 1.6 = 4
    // normalizedScore = (4 / 5) * 100 = 80

    const result = service.calculateScores(schema, answers);

    expect(result.totalScore).toBe(4);
    expect(result.normalizedScore).toBe(80);
    expect(result.sectionBreakdown).toHaveLength(2);
    expect(result.sectionBreakdown[0].average).toBe(4);
    expect(result.sectionBreakdown[1].average).toBe(4);
  });

  it('should handle different weights correctly', () => {
    const answers = {
      q1: 5,
      q2: 5, // Avg S1 = 5
      q3: 1, // Avg S2 = 1
    };

    // totalScore = 5 * 0.6 + 1 * 0.4 = 3 + 0.4 = 3.4
    // normalizedScore = (3.4 / 5) * 100 = 68

    const result = service.calculateScores(schema, answers);

    expect(result.totalScore).toBe(3.4);
    expect(result.normalizedScore).toBe(68);
  });
});
