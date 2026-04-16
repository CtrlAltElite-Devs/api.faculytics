import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { env } from 'src/configurations/env';

const FALLBACK_COMMENTS = [
  'Good teaching.',
  'Helpful instructor.',
  'The class was informative.',
  'I learned a lot.',
  'Very supportive faculty.',
  'Clear explanations.',
  'Engaging lectures.',
  'Well-organized course.',
  'Responsive to student questions.',
  'Fair grading practices.',
];

@Injectable()
export class CommentGeneratorService {
  private readonly logger = new Logger(CommentGeneratorService.name);
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async GenerateComments(
    count: number,
    context: {
      courseName: string;
      facultyName: string;
      maxScore: number;
      maxLength?: number;
      promptTheme?: string;
    },
  ): Promise<string[]> {
    try {
      const maxLengthInstruction = context.maxLength
        ? `Each comment must be under ${context.maxLength} characters.`
        : '';

      const theme = context.promptTheme?.trim();
      const themeInstruction = theme
        ? `Thematic guidance (shape tone and topic accordingly, but preserve realism and the language distribution): "${theme}".`
        : '';

      const response = await this.openai.chat.completions.create(
        {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You generate realistic student feedback comments for faculty evaluations. ' +
                'Return a JSON object with a "comments" key containing an array of strings. ' +
                'Language distribution: ~60% English, ~15% Tagalog, ~15% Cebuano, ~10% mixed/code-switched (e.g., Taglish or Bisaya-English). ' +
                'Comments should be varied in tone (positive, constructive, mixed) and length. ' +
                'They should sound like real Filipino college students evaluating their professors.',
            },
            {
              role: 'user',
              content:
                `Generate exactly ${count} student feedback comments for the course "${context.courseName}" ` +
                `taught by "${context.facultyName}". The course uses a ${context.maxScore}-point scale. ` +
                `${maxLengthInstruction} ${themeInstruction} ` +
                `Return JSON: { "comments": ["comment1", "comment2", ...] }`,
            },
          ],
          response_format: { type: 'json_object' },
        },
        { timeout: 60_000 },
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        this.logger.warn('OpenAI returned no content for comment generation');
        return this.getFallbackComments(count, context.maxLength);
      }

      const parsed = JSON.parse(content) as { comments?: unknown[] };
      const comments = parsed.comments;

      if (!Array.isArray(comments) || comments.length === 0) {
        this.logger.warn(
          `OpenAI returned invalid comment array (expected ${count}, got ${Array.isArray(comments) ? comments.length : 'non-array'})`,
        );
        return this.getFallbackComments(count, context.maxLength);
      }

      // Normalize to exact count: pad with fallback if short, truncate if long
      const fallback = this.getFallbackComments(count, context.maxLength);
      const result: string[] = [];
      for (let i = 0; i < count; i++) {
        const raw = i < comments.length ? comments[i] : undefined;
        let str = typeof raw === 'string' ? raw : fallback[i];
        if (context.maxLength && str.length > context.maxLength) {
          str = str.slice(0, context.maxLength);
        }
        result.push(str);
      }

      if (comments.length !== count) {
        this.logger.warn(
          `OpenAI returned ${comments.length} comments instead of ${count}, padded with fallback`,
        );
      }

      return result;
    } catch (error) {
      this.logger.warn(
        `Failed to generate comments via OpenAI, using fallback: ${(error as Error).message}`,
      );
      return this.getFallbackComments(count, context.maxLength);
    }
  }

  private getFallbackComments(count: number, maxLength?: number): string[] {
    const comments: string[] = [];
    for (let i = 0; i < count; i++) {
      let comment = FALLBACK_COMMENTS[i % FALLBACK_COMMENTS.length];
      if (maxLength && comment.length > maxLength) {
        comment = comment.slice(0, maxLength);
      }
      comments.push(comment);
    }
    return comments;
  }
}
