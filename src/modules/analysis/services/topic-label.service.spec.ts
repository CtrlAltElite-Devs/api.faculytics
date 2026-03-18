import { TopicLabelService } from './topic-label.service';
import { Topic } from 'src/entities/topic.entity';

// Mock env before importing the service
jest.mock('src/configurations/env', () => ({
  env: { OPENAI_API_KEY: 'test-key' },
}));

// Mock OpenAI
const mockParse = jest.fn();
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          parse: mockParse,
        },
      },
    })),
  };
});

jest.mock('openai/helpers/zod', () => ({
  zodResponseFormat: jest.fn().mockReturnValue({ type: 'json_schema' }),
}));

describe('TopicLabelService', () => {
  let service: TopicLabelService;

  const createMockTopic = (
    topicIndex: number,
    rawLabel: string,
    keywords: string[],
  ): Topic =>
    ({
      topicIndex,
      rawLabel,
      keywords,
      label: undefined,
    }) as unknown as Topic;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TopicLabelService();
  });

  it('should set labels on topics from LLM response', async () => {
    const topics = [
      createMockTopic(0, '0_teaching_maayo_method', [
        'teaching',
        'maayo',
        'method',
      ]),
      createMockTopic(1, '1_schedule_time_class', [
        'schedule',
        'time',
        'class',
      ]),
    ];

    mockParse.mockResolvedValue({
      choices: [
        {
          message: {
            parsed: {
              labels: [
                { topicIndex: 0, label: 'Teaching Methods' },
                { topicIndex: 1, label: 'Class Scheduling' },
              ],
            },
          },
        },
      ],
    });

    await service.generateLabels(topics);

    expect((topics[0] as unknown as Record<string, unknown>).label).toBe(
      'Teaching Methods',
    );
    expect((topics[1] as unknown as Record<string, unknown>).label).toBe(
      'Class Scheduling',
    );
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it('should leave labels unchanged on LLM failure', async () => {
    const topics = [
      createMockTopic(0, '0_teaching_maayo_method', [
        'teaching',
        'maayo',
        'method',
      ]),
    ];

    mockParse.mockRejectedValue(new Error('API rate limit'));

    await service.generateLabels(topics);

    expect(
      (topics[0] as unknown as Record<string, unknown>).label,
    ).toBeUndefined();
  });

  it('should handle empty parsed response gracefully', async () => {
    const topics = [
      createMockTopic(0, '0_teaching_maayo_method', [
        'teaching',
        'maayo',
        'method',
      ]),
    ];

    mockParse.mockResolvedValue({
      choices: [{ message: { parsed: null } }],
    });

    await service.generateLabels(topics);

    expect(
      (topics[0] as unknown as Record<string, unknown>).label,
    ).toBeUndefined();
  });

  it('should skip topics not in LLM response', async () => {
    const topics = [
      createMockTopic(0, '0_teaching_maayo_method', [
        'teaching',
        'maayo',
        'method',
      ]),
      createMockTopic(1, '1_schedule_time_class', [
        'schedule',
        'time',
        'class',
      ]),
    ];

    mockParse.mockResolvedValue({
      choices: [
        {
          message: {
            parsed: {
              labels: [{ topicIndex: 0, label: 'Teaching Methods' }],
            },
          },
        },
      ],
    });

    await service.generateLabels(topics);

    expect((topics[0] as unknown as Record<string, unknown>).label).toBe(
      'Teaching Methods',
    );
    expect(
      (topics[1] as unknown as Record<string, unknown>).label,
    ).toBeUndefined();
  });

  it('should do nothing for empty topics array', async () => {
    await service.generateLabels([]);

    expect(mockParse).not.toHaveBeenCalled();
  });
});
