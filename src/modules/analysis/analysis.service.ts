import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 } from 'uuid';
import { env } from 'src/configurations/env';
import {
  AnalysisJobMessage,
  analysisJobSchema,
} from './dto/analysis-job-message.dto';

interface JobInput {
  type: string;
  text: string;
  metadata: {
    submissionId: string;
    facultyId: string;
    versionId: string;
  };
}

type SupportedQueueType =
  | 'sentiment'
  | 'embedding'
  | 'topic-model'
  | 'recommendations';

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly queues: Record<SupportedQueueType, Queue>;

  constructor(
    @InjectQueue('sentiment') private readonly sentimentQueue: Queue,
    @InjectQueue('embedding') private readonly embeddingQueue: Queue,
    @InjectQueue('topic-model') private readonly topicModelQueue: Queue,
    @InjectQueue('recommendations')
    private readonly recommendationsQueue: Queue,
  ) {
    this.queues = {
      sentiment: this.sentimentQueue,
      embedding: this.embeddingQueue,
      'topic-model': this.topicModelQueue,
      recommendations: this.recommendationsQueue,
    };
  }

  async EnqueueJob(
    type: string,
    text: string,
    metadata: JobInput['metadata'],
  ): Promise<string> {
    const queue = this.getQueue(type);
    const jobId = v4();
    const deterministicId = `${metadata.submissionId}:${type}`;

    const envelope: AnalysisJobMessage = {
      jobId,
      version: '1.0',
      type,
      text,
      metadata,
      publishedAt: new Date().toISOString(),
    };

    analysisJobSchema.parse(envelope);

    try {
      await queue.add(type, envelope, {
        jobId: deterministicId,
        attempts: env.BULLMQ_DEFAULT_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: env.BULLMQ_DEFAULT_BACKOFF_MS,
        },
      });
    } catch (error) {
      if (this.isConnectionError(error)) {
        this.logger.error(
          `Redis connection error: ${(error as Error).message}`,
        );
        throw new ServiceUnavailableException(
          'Analysis queue is currently unavailable',
        );
      }
      throw error;
    }

    this.logger.log(`Enqueued ${type} job ${deterministicId}`);
    return jobId;
  }

  async EnqueueBatch(jobs: JobInput[]): Promise<string[]> {
    if (jobs.length === 0) return [];

    const grouped = new Map<
      string,
      { envelope: AnalysisJobMessage; deterministicId: string }[]
    >();

    const jobIds: string[] = [];

    for (const job of jobs) {
      this.getQueue(job.type); // validate type

      const jobId = v4();
      const deterministicId = `${job.metadata.submissionId}:${job.type}`;

      const envelope: AnalysisJobMessage = {
        jobId,
        version: '1.0',
        type: job.type,
        text: job.text,
        metadata: job.metadata,
        publishedAt: new Date().toISOString(),
      };

      analysisJobSchema.parse(envelope);

      if (!grouped.has(job.type)) grouped.set(job.type, []);
      grouped.get(job.type)!.push({ envelope, deterministicId });
      jobIds.push(jobId);
    }

    try {
      for (const [type, items] of grouped) {
        const queue = this.getQueue(type);
        await queue.addBulk(
          items.map((item) => ({
            name: type,
            data: item.envelope,
            opts: {
              jobId: item.deterministicId,
              attempts: env.BULLMQ_DEFAULT_ATTEMPTS,
              backoff: {
                type: 'exponential' as const,
                delay: env.BULLMQ_DEFAULT_BACKOFF_MS,
              },
            },
          })),
        );
      }
    } catch (error) {
      if (this.isConnectionError(error)) {
        this.logger.error(
          `Redis connection error: ${(error as Error).message}`,
        );
        throw new ServiceUnavailableException(
          'Analysis queue is currently unavailable',
        );
      }
      throw error;
    }

    this.logger.log(`Enqueued batch of ${jobs.length} jobs`);
    return jobIds;
  }

  private getQueue(type: string): Queue {
    const queue = this.queues[type as SupportedQueueType];
    if (!queue) {
      throw new BadRequestException(`Analysis type "${type}" is not supported`);
    }
    return queue;
  }

  private isConnectionError(error: unknown): boolean {
    const message = (error as Error)?.message ?? '';
    return (
      message.includes('ECONNREFUSED') ||
      message.includes('ENOTFOUND') ||
      message.includes('ETIMEDOUT') ||
      message.includes('Connection is closed') ||
      message.includes('MaxRetriesPerRequestError')
    );
  }
}
