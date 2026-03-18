import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import z from 'zod';
import { env } from 'src/configurations/env';
import { Topic } from 'src/entities/topic.entity';

const topicLabelResponseSchema = z.object({
  labels: z.array(
    z.object({
      topicIndex: z.number().int(),
      label: z.string(),
    }),
  ),
});

type TopicLabelResponse = z.infer<typeof topicLabelResponseSchema>;

@Injectable()
export class TopicLabelService {
  private readonly logger = new Logger(TopicLabelService.name);
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async generateLabels(topics: Topic[]): Promise<void> {
    if (topics.length === 0) return;

    const topicDescriptions = topics
      .map(
        (t) =>
          `- Topic ${t.topicIndex}: rawLabel="${t.rawLabel}", keywords=[${t.keywords.join(', ')}]`,
      )
      .join('\n');

    try {
      const response = await this.openai.chat.completions.parse({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You generate short, human-readable topic labels for BERTopic outputs. ' +
              'Each label should be 2-4 words in English that clearly describe the theme. ' +
              'Use title case.',
          },
          {
            role: 'user',
            content: `Generate a concise human-readable label for each of the following topics:\n\n${topicDescriptions}`,
          },
        ],
        response_format: zodResponseFormat(
          topicLabelResponseSchema,
          'topic_labels',
        ),
      });

      const parsed: TopicLabelResponse | null | undefined =
        response.choices[0]?.message?.parsed;
      if (!parsed) {
        this.logger.warn('LLM returned no parsed content for topic labels');
        return;
      }

      const labelMap = new Map<number, string>(
        parsed.labels.map((l) => [l.topicIndex, l.label]),
      );

      for (const topic of topics) {
        const label = labelMap.get(topic.topicIndex);
        if (label) {
          topic.label = label;
        }
      }

      this.logger.log(`Generated labels for ${labelMap.size} topics`);
    } catch (error) {
      this.logger.warn(
        `Failed to generate topic labels via LLM, falling back to rawLabel: ${(error as Error).message}`,
      );
    }
  }
}
