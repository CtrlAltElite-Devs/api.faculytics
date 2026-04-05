/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { RecommendationGenerationService } from './recommendation-generation.service';
import { TopicAssignment } from 'src/entities/topic-assignment.entity';
import { RECOMMENDATION_THRESHOLDS } from '../constants';
import type { TopicSource } from '../dto/recommendations.dto';

// Mock OpenAI
const mockParse = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        parse: mockParse,
      },
    },
  }));
});

jest.mock('openai/helpers/zod', () => ({
  zodResponseFormat: jest.fn().mockReturnValue({ type: 'json_schema' }),
}));

const createMockFork = () => ({
  findOneOrFail: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  createQueryBuilder: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue([]),
  }),
});

const makePipeline = () => ({
  id: 'pipeline-1',
  semester: { id: 's1' },
  faculty: { id: 'f1' },
  department: undefined,
  program: undefined,
  campus: undefined,
  course: undefined,
  questionnaireVersion: undefined,
  submissionCount: 50,
  commentCount: 40,
  responseRate: 0.5,
});

const makeTopics = () => [
  {
    id: 't1',
    topicIndex: 0,
    rawLabel: 'raw_topic_1',
    label: 'Teaching Quality',
    keywords: ['teaching', 'quality'],
    docCount: 15,
  },
  {
    id: 't2',
    topicIndex: 1,
    rawLabel: 'raw_topic_2',
    label: 'Course Materials',
    keywords: ['materials', 'resources'],
    docCount: 8,
  },
];

const makeLlmResponse = (
  recommendations = [
    {
      category: 'STRENGTH' as const,
      headline: 'Strong Teaching Methods',
      description: 'Students appreciate the teaching approach.',
      actionPlan: 'Continue current methods. Consider sharing best practices.',
      priority: 'HIGH' as const,
      topicReference: 'Teaching Quality',
    },
    {
      category: 'IMPROVEMENT' as const,
      headline: 'Update Course Materials',
      description: 'Students note outdated materials.',
      actionPlan: 'Review and update course materials. Add current references.',
      priority: 'MEDIUM' as const,
      topicReference: 'Course Materials',
    },
  ],
) => ({
  choices: [
    {
      message: {
        parsed: { recommendations },
      },
    },
  ],
});

describe('RecommendationGenerationService', () => {
  let service: RecommendationGenerationService;
  let mockFork: ReturnType<typeof createMockFork>;

  beforeEach(async () => {
    mockFork = createMockFork();

    const mockEm = {
      fork: jest.fn().mockReturnValue(mockFork),
    };

    mockParse.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationGenerationService,
        { provide: EntityManager, useValue: mockEm },
      ],
    }).compile();

    service = module.get<RecommendationGenerationService>(
      RecommendationGenerationService,
    );
  });

  it('should call OpenAI with correct prompt structure and zodResponseFormat', async () => {
    mockFork.findOneOrFail.mockResolvedValue(makePipeline());
    mockFork.findOne
      .mockResolvedValueOnce({ id: 'sr1' }) // sentiment run
      .mockResolvedValueOnce({ id: 'tmr1' }); // topic model run
    mockFork.find
      .mockResolvedValueOnce([{ id: 'sub1' }]) // submissions
      .mockResolvedValueOnce([]) // sentiment results
      .mockResolvedValueOnce([]); // topics (empty = no batch assignment query)

    mockParse.mockResolvedValue(makeLlmResponse([]));

    await service.Generate('pipeline-1');

    expect(mockParse).toHaveBeenCalledTimes(1);
    const callArgs = mockParse.mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(2);
    expect(callArgs.messages[0].role).toBe('system');
    expect(callArgs.messages[1].role).toBe('user');
    expect(callArgs.response_format).toBeDefined();
  });

  it('should assemble evidence from pipeline data with topic match', async () => {
    const topics = makeTopics();
    const sentimentResults = [
      {
        id: 'sr1',
        label: 'positive',
        submission: { id: 'sub1' },
        positiveScore: 0.9,
        negativeScore: 0.1,
      },
      {
        id: 'sr2',
        label: 'negative',
        submission: { id: 'sub2' },
        positiveScore: 0.1,
        negativeScore: 0.8,
      },
    ];

    mockFork.findOneOrFail.mockResolvedValue(makePipeline());
    mockFork.findOne
      .mockResolvedValueOnce({ id: 'sr1' }) // sentiment run
      .mockResolvedValueOnce({ id: 'tmr1' }); // topic model run
    mockFork.find
      .mockResolvedValueOnce([{ id: 'sub1' }, { id: 'sub2' }]) // submissions
      .mockResolvedValueOnce(sentimentResults) // sentiment results
      .mockResolvedValueOnce(topics) // topics
      .mockResolvedValueOnce([
        // all topic assignments (batch)
        { topic: { id: 't1' }, submission: { id: 'sub1' }, isDominant: true },
        { topic: { id: 't2' }, submission: { id: 'sub2' }, isDominant: true },
      ])
      .mockResolvedValueOnce([]) // topic 1 quote subs
      .mockResolvedValueOnce([]); // topic 2 quote subs

    mockParse.mockResolvedValue(makeLlmResponse());

    const result = await service.Generate('pipeline-1');

    expect(result.length).toBe(2);

    // First recommendation matched 'Teaching Quality'
    const firstEvidence = result[0].supportingEvidence;
    expect(firstEvidence.sources.length).toBe(2); // topic + dimension_scores
    expect(firstEvidence.sources[0].type).toBe('topic');

    // All recommendations get dimension_scores
    for (const rec of result) {
      const hasDimScores = rec.supportingEvidence.sources.some(
        (s) => s.type === 'dimension_scores',
      );
      expect(hasDimScores).toBe(true);
    }
  });

  it('should compute LOW confidence when commentCount < 5', async () => {
    const topics = [{ ...makeTopics()[0], docCount: 3 }];
    const sentimentResults = [
      {
        id: 'sr1',
        label: 'positive',
        submission: { id: 'sub1' },
        positiveScore: 0.9,
        negativeScore: 0.1,
      },
    ];

    mockFork.findOneOrFail.mockResolvedValue(makePipeline());
    mockFork.findOne
      .mockResolvedValueOnce({ id: 'sr1' })
      .mockResolvedValueOnce({ id: 'tmr1' });
    mockFork.find
      .mockResolvedValueOnce([{ id: 'sub1' }])
      .mockResolvedValueOnce(sentimentResults)
      .mockResolvedValueOnce(topics)
      .mockResolvedValueOnce([
        { topic: { id: 't1' }, submission: { id: 'sub1' }, isDominant: true },
      ]) // batch assignments
      .mockResolvedValueOnce([]); // quote subs

    const llmRecs = [
      {
        category: 'STRENGTH' as const,
        headline: 'Test',
        description: 'Test desc',
        actionPlan: 'Test plan',
        priority: 'HIGH' as const,
        topicReference: 'Teaching Quality',
      },
    ];
    mockParse.mockResolvedValue(makeLlmResponse(llmRecs));

    const result = await service.Generate('pipeline-1');

    expect(result[0].supportingEvidence.confidenceLevel).toBe('LOW');
    // Scoped count = 1 assignment (not docCount 3)
    const topicSource = result[0].supportingEvidence.sources.find(
      (s) => s.type === 'topic',
    );
    expect(topicSource).toBeDefined();
    expect((topicSource as TopicSource).commentCount).toBe(1);
  });

  it('should compute HIGH confidence when commentCount >= 10 and agreement > 0.7', async () => {
    const topics = [{ ...makeTopics()[0], docCount: 15 }];
    // 12 positive out of 14 total = 0.857 agreement
    const sentimentResults = Array.from({ length: 12 }, (_, i) => ({
      id: `sr${i}`,
      label: 'positive',
      submission: { id: `sub${i}` },
      positiveScore: 0.9,
      negativeScore: 0.1,
    })).concat([
      {
        id: 'sr12',
        label: 'neutral',
        submission: { id: 'sub12' },
        positiveScore: 0.3,
        negativeScore: 0.2,
      },
      {
        id: 'sr13',
        label: 'negative',
        submission: { id: 'sub13' },
        positiveScore: 0.1,
        negativeScore: 0.8,
      },
    ]);

    const allSubIds = sentimentResults.map((r) => r.submission.id);
    const assignments = allSubIds.map((id) => ({
      topic: { id: 't1' },
      submission: { id },
      isDominant: true,
    }));

    mockFork.findOneOrFail.mockResolvedValue(makePipeline());
    mockFork.findOne
      .mockResolvedValueOnce({ id: 'sr1' })
      .mockResolvedValueOnce({ id: 'tmr1' });
    mockFork.find
      .mockResolvedValueOnce(allSubIds.map((id) => ({ id })))
      .mockResolvedValueOnce(sentimentResults)
      .mockResolvedValueOnce(topics)
      .mockResolvedValueOnce(assignments) // batch topic assignments
      .mockResolvedValueOnce([]); // quote subs

    const llmRecs = [
      {
        category: 'STRENGTH' as const,
        headline: 'Test',
        description: 'Test desc',
        actionPlan: 'Test plan',
        priority: 'HIGH' as const,
        topicReference: 'Teaching Quality',
      },
    ];
    mockParse.mockResolvedValue(makeLlmResponse(llmRecs));

    const result = await service.Generate('pipeline-1');

    expect(result[0].supportingEvidence.confidenceLevel).toBe('HIGH');
    // Scoped count = 14 assignments (not docCount 15)
    const topicSource = result[0].supportingEvidence.sources.find(
      (s) => s.type === 'topic',
    );
    expect(topicSource).toBeDefined();
    expect((topicSource as TopicSource).commentCount).toBe(14);
  });

  it('should compute MEDIUM confidence for >= 10 comments with <= 0.7 agreement', async () => {
    const topics = [{ ...makeTopics()[0], docCount: 12 }];
    // 5 positive, 4 neutral, 3 negative = max/total = 5/12 = 0.417
    const sentimentResults = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `srp${i}`,
        label: 'positive',
        submission: { id: `subp${i}` },
        positiveScore: 0.8,
        negativeScore: 0.1,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `srn${i}`,
        label: 'neutral',
        submission: { id: `subn${i}` },
        positiveScore: 0.3,
        negativeScore: 0.3,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `srng${i}`,
        label: 'negative',
        submission: { id: `subng${i}` },
        positiveScore: 0.1,
        negativeScore: 0.8,
      })),
    ];

    const allSubIds = sentimentResults.map((r) => r.submission.id);
    const assignments = allSubIds.map((id) => ({
      topic: { id: 't1' },
      submission: { id },
      isDominant: true,
    }));

    mockFork.findOneOrFail.mockResolvedValue(makePipeline());
    mockFork.findOne
      .mockResolvedValueOnce({ id: 'sr1' })
      .mockResolvedValueOnce({ id: 'tmr1' });
    mockFork.find
      .mockResolvedValueOnce(allSubIds.map((id) => ({ id })))
      .mockResolvedValueOnce(sentimentResults)
      .mockResolvedValueOnce(topics)
      .mockResolvedValueOnce(assignments) // batch topic assignments
      .mockResolvedValueOnce([]); // quote subs

    const llmRecs = [
      {
        category: 'IMPROVEMENT' as const,
        headline: 'Test',
        description: 'Test desc',
        actionPlan: 'Test plan',
        priority: 'MEDIUM' as const,
        topicReference: 'Teaching Quality',
      },
    ];
    mockParse.mockResolvedValue(makeLlmResponse(llmRecs));

    const result = await service.Generate('pipeline-1');

    expect(result[0].supportingEvidence.confidenceLevel).toBe('MEDIUM');
    // Scoped count = 12 assignments (matches docCount 12 in this case)
    const topicSource = result[0].supportingEvidence.sources.find(
      (s) => s.type === 'topic',
    );
    expect(topicSource).toBeDefined();
    expect((topicSource as TopicSource).commentCount).toBe(12);
  });

  it('should throw on OpenAI API failure', async () => {
    mockFork.findOneOrFail.mockResolvedValue(makePipeline());
    mockFork.findOne
      .mockResolvedValueOnce({ id: 'sr1' })
      .mockResolvedValueOnce({ id: 'tmr1' });
    mockFork.find
      .mockResolvedValueOnce([{ id: 'sub1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockParse.mockRejectedValue(new Error('OpenAI API rate limit'));

    await expect(service.Generate('pipeline-1')).rejects.toThrow(
      'OpenAI API rate limit',
    );
  });

  it('should handle empty topics gracefully', async () => {
    mockFork.findOneOrFail.mockResolvedValue(makePipeline());
    mockFork.findOne
      .mockResolvedValueOnce({ id: 'sr1' })
      .mockResolvedValueOnce({ id: 'tmr1' });
    mockFork.find
      .mockResolvedValueOnce([{ id: 'sub1' }])
      .mockResolvedValueOnce([
        {
          id: 'sr1',
          label: 'positive',
          submission: { id: 'sub1' },
          positiveScore: 0.9,
          negativeScore: 0.1,
        },
      ])
      .mockResolvedValueOnce([]); // no topics

    const llmRecs = [
      {
        category: 'IMPROVEMENT' as const,
        headline: 'General Improvement',
        description: 'Based on overall feedback.',
        actionPlan: 'Review student feedback patterns.',
        priority: 'MEDIUM' as const,
      },
    ];
    mockParse.mockResolvedValue(makeLlmResponse(llmRecs));

    const result = await service.Generate('pipeline-1');

    expect(result.length).toBe(1);
    // Only dimension_scores source (no topic)
    expect(result[0].supportingEvidence.sources.length).toBe(1);
    expect(result[0].supportingEvidence.sources[0].type).toBe(
      'dimension_scores',
    );
  });

  it('should cap sampleQuotes at MAX_SAMPLE_QUOTES', () => {
    expect(RECOMMENDATION_THRESHOLDS.MAX_SAMPLE_QUOTES).toBe(3);
  });

  it('should omit topic evidence for unmatched topicReference', async () => {
    mockFork.findOneOrFail.mockResolvedValue(makePipeline());
    mockFork.findOne
      .mockResolvedValueOnce({ id: 'sr1' })
      .mockResolvedValueOnce({ id: 'tmr1' });
    mockFork.find
      .mockResolvedValueOnce([{ id: 'sub1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]); // no topics

    const llmRecs = [
      {
        category: 'STRENGTH' as const,
        headline: 'Test',
        description: 'Test',
        actionPlan: 'Test',
        priority: 'HIGH' as const,
        topicReference: 'Nonexistent Topic',
      },
    ];
    mockParse.mockResolvedValue(makeLlmResponse(llmRecs));

    const result = await service.Generate('pipeline-1');

    // No topic evidence, only dimension_scores
    const topicSources = result[0].supportingEvidence.sources.filter(
      (s) => s.type === 'topic',
    );
    expect(topicSources.length).toBe(0);
  });

  it('should use pipeline-level data for confidence when no topic match', async () => {
    // Pipeline with enough comments globally
    const pipeline = { ...makePipeline(), commentCount: 40 };
    mockFork.findOneOrFail.mockResolvedValue(pipeline);
    mockFork.findOne
      .mockResolvedValueOnce({ id: 'sr1' })
      .mockResolvedValueOnce({ id: 'tmr1' });

    // Many submissions = large comment count for fallback
    const subs = Array.from({ length: 20 }, (_, i) => ({ id: `sub${i}` }));
    const sentimentResults = subs.map((s, i) => ({
      id: `sr${i}`,
      label: i < 16 ? 'positive' : 'negative',
      submission: s,
      positiveScore: i < 16 ? 0.9 : 0.1,
      negativeScore: i < 16 ? 0.1 : 0.8,
    }));

    mockFork.find
      .mockResolvedValueOnce(subs) // submissions
      .mockResolvedValueOnce(sentimentResults) // sentiment results
      .mockResolvedValueOnce([]); // no topics

    const llmRecs = [
      {
        category: 'STRENGTH' as const,
        headline: 'Test',
        description: 'Test',
        actionPlan: 'Test',
        priority: 'HIGH' as const,
        topicReference: 'Nonexistent Topic',
      },
    ];
    mockParse.mockResolvedValue(makeLlmResponse(llmRecs));

    const result = await service.Generate('pipeline-1');

    // Pipeline-level: 20 comments, 16/20 = 0.8 agreement → HIGH
    expect(result[0].supportingEvidence.confidenceLevel).toBe('HIGH');
  });

  it('should scope TopicAssignment query to pipeline submissionIds', async () => {
    const topics = makeTopics();
    mockFork.findOneOrFail.mockResolvedValue(makePipeline());
    mockFork.findOne
      .mockResolvedValueOnce({ id: 'sr1' })
      .mockResolvedValueOnce({ id: 'tmr1' });
    mockFork.find
      .mockResolvedValueOnce([{ id: 'sub1' }, { id: 'sub2' }]) // submissions
      .mockResolvedValueOnce([]) // sentiment results
      .mockResolvedValueOnce(topics) // topics
      .mockResolvedValueOnce([]); // topic assignments (empty = no quote sub queries)

    mockParse.mockResolvedValue(makeLlmResponse([]));

    await service.Generate('pipeline-1');

    const assignmentCall = mockFork.find.mock.calls.find(
      (call) => call[0] === TopicAssignment,
    );
    expect(assignmentCall).toBeDefined();
    expect(assignmentCall![1]).toEqual(
      expect.objectContaining({
        topic: { $in: ['t1', 't2'] },
        submission: { $in: ['sub1', 'sub2'] },
      }),
    );
  });

  it('should produce accurate evidence from scoped assignments', async () => {
    const topics = [
      {
        id: 't1',
        topicIndex: 0,
        rawLabel: 'raw_topic_1',
        label: 'Teaching Quality',
        keywords: ['teaching', 'quality'],
        docCount: 50, // intentionally large to prove scoped count is used
      },
    ];
    const sentimentResults = [
      {
        id: 'sr1',
        label: 'positive',
        submission: { id: 'sub1' },
        positiveScore: 0.9,
        negativeScore: 0.1,
      },
      {
        id: 'sr2',
        label: 'negative',
        submission: { id: 'sub2' },
        positiveScore: 0.1,
        negativeScore: 0.8,
      },
    ];

    mockFork.findOneOrFail.mockResolvedValue(makePipeline());
    mockFork.findOne
      .mockResolvedValueOnce({ id: 'sr1' })
      .mockResolvedValueOnce({ id: 'tmr1' });
    mockFork.find
      .mockResolvedValueOnce([{ id: 'sub1' }, { id: 'sub2' }]) // submissions
      .mockResolvedValueOnce(sentimentResults) // sentiment results
      .mockResolvedValueOnce(topics) // topics
      .mockResolvedValueOnce([
        // topic assignments — only in-scope
        { topic: { id: 't1' }, submission: { id: 'sub1' }, isDominant: true },
        { topic: { id: 't1' }, submission: { id: 'sub2' }, isDominant: false },
      ])
      .mockResolvedValueOnce([
        { id: 'sub1', cleanedComment: 'Great teaching methods' },
      ]); // quote subs for dominant sub1

    const llmRecs = [
      {
        category: 'STRENGTH' as const,
        headline: 'Strong Teaching',
        description: 'Students appreciate teaching.',
        actionPlan: 'Continue current methods.',
        priority: 'HIGH' as const,
        topicReference: 'Teaching Quality',
      },
    ];
    mockParse.mockResolvedValue(makeLlmResponse(llmRecs));

    const result = await service.Generate('pipeline-1');

    expect(result.length).toBe(1);

    const topicSource = result[0].supportingEvidence.sources.find(
      (s) => s.type === 'topic',
    );
    expect(topicSource).toBeDefined();
    expect((topicSource as TopicSource).commentCount).toBe(2); // scoped, NOT docCount 50
    expect((topicSource as TopicSource).sampleQuotes).toEqual([
      'Great teaching methods',
    ]);
    expect((topicSource as TopicSource).sentimentBreakdown).toEqual({
      positive: 1,
      neutral: 0,
      negative: 1,
    });
    expect(result[0].supportingEvidence.confidenceLevel).toBe('LOW'); // 2 < 5
  });

  it('should attach dimension_scores evidence to every recommendation', async () => {
    mockFork.findOneOrFail.mockResolvedValue(makePipeline());
    mockFork.findOne
      .mockResolvedValueOnce({ id: 'sr1' })
      .mockResolvedValueOnce({ id: 'tmr1' });
    mockFork.find
      .mockResolvedValueOnce([{ id: 'sub1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const llmRecs = [
      {
        category: 'STRENGTH' as const,
        headline: 'A',
        description: 'D',
        actionPlan: 'P',
        priority: 'HIGH' as const,
      },
      {
        category: 'IMPROVEMENT' as const,
        headline: 'B',
        description: 'D',
        actionPlan: 'P',
        priority: 'LOW' as const,
      },
    ];
    mockParse.mockResolvedValue(makeLlmResponse(llmRecs));

    const result = await service.Generate('pipeline-1');

    for (const rec of result) {
      const dimSources = rec.supportingEvidence.sources.filter(
        (s) => s.type === 'dimension_scores',
      );
      expect(dimSources.length).toBe(1);
    }
  });
});
