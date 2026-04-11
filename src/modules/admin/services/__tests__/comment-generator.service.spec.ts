import { Test, TestingModule } from '@nestjs/testing';
import { CommentGeneratorService } from '../comment-generator.service';

// Mock env before importing the service
jest.mock('src/configurations/env', () => ({
  env: { OPENAI_API_KEY: 'test-key' },
}));

interface MockMessage {
  role: string;
  content: string;
}

interface MockCreateArgs {
  messages: MockMessage[];
  response_format: { type: string };
}

const mockCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

function getCallArgs(): MockCreateArgs {
  const calls = mockCreate.mock.calls as MockCreateArgs[][];
  return calls[0][0];
}

describe('CommentGeneratorService', () => {
  let service: CommentGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommentGeneratorService],
    }).compile();

    service = module.get(CommentGeneratorService);
    mockCreate.mockReset();
  });

  const context = {
    courseName: 'CS101 Intro to Programming',
    facultyName: 'Prof. Santos',
    maxScore: 5,
  };

  it('should return parsed comments on successful generation', async () => {
    const comments = ['Great class!', 'Maganda ang turo.', 'Very helpful.'];
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ comments }) } }],
    });

    const result = await service.GenerateComments(3, context);

    expect(result).toEqual(comments);
    expect(result).toHaveLength(3);
  });

  it('should include course and faculty name in the prompt', async () => {
    const comments = ['Comment 1'];
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ comments }) } }],
    });

    await service.GenerateComments(1, context);

    const args = getCallArgs();
    const userMessage = args.messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('CS101 Intro to Programming');
    expect(userMessage?.content).toContain('Prof. Santos');
  });

  it('should include language distribution in the system prompt', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        { message: { content: JSON.stringify({ comments: ['test'] }) } },
      ],
    });

    await service.GenerateComments(1, context);

    const args = getCallArgs();
    const systemMessage = args.messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain('English');
    expect(systemMessage?.content).toContain('Tagalog');
    expect(systemMessage?.content).toContain('Cebuano');
  });

  it('should return fallback comments on API error', async () => {
    mockCreate.mockRejectedValue(new Error('API timeout'));

    const result = await service.GenerateComments(3, context);

    expect(result).toHaveLength(3);
    result.forEach((c) => expect(typeof c).toBe('string'));
    result.forEach((c) => expect(c.length).toBeGreaterThan(0));
  });

  it('should return fallback comments when response is not a valid array', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        { message: { content: JSON.stringify({ comments: 'not-an-array' }) } },
      ],
    });

    const result = await service.GenerateComments(3, context);

    expect(result).toHaveLength(3);
    result.forEach((c) => expect(typeof c).toBe('string'));
  });

  it('should pad with fallback when count is short', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        { message: { content: JSON.stringify({ comments: ['only one'] }) } },
      ],
    });

    const result = await service.GenerateComments(3, context);

    expect(result).toHaveLength(3);
    expect(result[0]).toBe('only one');
    // remaining are fallback strings
    expect(typeof result[1]).toBe('string');
    expect(typeof result[2]).toBe('string');
  });

  it('should truncate comments exceeding maxLength', async () => {
    const longComment = 'A'.repeat(300);
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ comments: [longComment] }),
          },
        },
      ],
    });

    const result = await service.GenerateComments(1, {
      ...context,
      maxLength: 100,
    });

    expect(result[0].length).toBeLessThanOrEqual(100);
  });

  it('should include maxLength constraint in prompt when provided', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        { message: { content: JSON.stringify({ comments: ['test'] }) } },
      ],
    });

    await service.GenerateComments(1, { ...context, maxLength: 200 });

    const args = getCallArgs();
    const userMessage = args.messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('200');
  });

  it('should return fallback when OpenAI returns no content', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    const result = await service.GenerateComments(3, context);

    expect(result).toHaveLength(3);
    result.forEach((c) => expect(typeof c).toBe('string'));
  });
});
