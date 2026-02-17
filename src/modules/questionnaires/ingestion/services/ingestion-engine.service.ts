import { Injectable, Logger } from '@nestjs/common';
import pLimit from 'p-limit';
import { v4 as uuidv4 } from 'uuid';
import { EntityManager, RequestContext } from '@mikro-orm/core';
import { QuestionnaireService } from 'src/modules/questionnaires/services/questionnaire.service';
import {
  IngestionMapperService,
  MappedSubmission,
} from './ingestion-mapper.service';
import { SourceAdapter } from '../interfaces/source-adapter.interface';
import { SourceConfiguration } from '../types/source-config.type';
import { RawSubmissionData } from '../dto/raw-submission-data.dto';
import {
  IngestionResultDto,
  IngestionRecordResult,
} from '../dto/ingestion-result.dto';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';

export class DryRunRollbackError extends Error {
  constructor() {
    super('DRY_RUN_ROLLBACK');
  }
}

@Injectable()
export class IngestionEngine {
  private readonly logger = new Logger(IngestionEngine.name);

  constructor(
    private readonly em: EntityManager,
    private readonly questionnaireService: QuestionnaireService,
    private readonly mapper: IngestionMapperService,
  ) {}

  async processStream<TConfig>(
    adapter: SourceAdapter<unknown, RawSubmissionData>,
    payload: unknown,
    config: SourceConfiguration<TConfig>,
    versionId: string,
  ): Promise<IngestionResultDto> {
    const ingestionId = uuidv4();
    const limit = pLimit(6);
    const results: IngestionRecordResult[] = [];
    let successes = 0;
    let failures = 0;
    const maxErrors = config.maxErrors ?? Infinity;
    const RECORD_LIMIT = config.maxRecords ?? 5000;
    let recordCount = 0;

    this.logger.log(
      `[${ingestionId}] Starting ingestion for version ${versionId}. DryRun: ${config.dryRun}`,
    );

    try {
      const stream = adapter.extract(payload, config);
      const tasks: Promise<void>[] = [];

      for await (const record of stream) {
        if (recordCount >= RECORD_LIMIT) {
          this.logger.warn(
            `[${ingestionId}] Record limit (${RECORD_LIMIT}) reached. Truncating.`,
          );
          break;
        }

        if (failures >= maxErrors && !config.dryRun) {
          this.logger.warn(
            `[${ingestionId}] Max errors (${maxErrors}) reached. Stopping ingestion.`,
          );
          break;
        }

        recordCount++;

        // Backpressure: pause if too many pending tasks
        while (limit.pendingCount > 10) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        const task = limit(async () => {
          const externalId =
            typeof record.sourceIdentifier === 'object'
              ? JSON.stringify(record.sourceIdentifier)
              : String(record.sourceIdentifier);

          const recordResult: IngestionRecordResult = {
            externalId,
            success: false,
          };

          const forkedEm = this.em.fork();

          try {
            await RequestContext.create(forkedEm, async () => {
              if (record.error) {
                throw new Error(record.error);
              }
              if (!record.data) {
                throw new Error('No data found in record.');
              }

              const mappingResult = await this.mapper.map(
                record.data,
                versionId,
              );
              if (!mappingResult.success) {
                throw new Error(mappingResult.error);
              }

              const submission = await this.withTimeout(
                this.executeSubmission(
                  forkedEm,
                  mappingResult.data!,
                  config.dryRun,
                ),
                30000,
              );

              recordResult.success = true;
              recordResult.internalId = submission.id;
              successes++;
            });
          } catch (e: unknown) {
            failures++;
            const message = e instanceof Error ? e.message : String(e);
            recordResult.error = message;
            this.logger.error(
              `[${ingestionId}] Record ${externalId} failed: ${message}`,
            );
          } finally {
            results.push(recordResult);
            forkedEm.clear();
          }
        });
        tasks.push(task);
      }

      await Promise.all(tasks);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`[${ingestionId}] Fatal ingestion error: ${message}`);
    } finally {
      if (adapter.close) {
        try {
          await adapter.close();
        } catch (closeError: unknown) {
          const message =
            closeError instanceof Error
              ? closeError.message
              : String(closeError);
          this.logger.error(
            `[${ingestionId}] Error closing adapter: ${message}`,
          );
        }
      }
    }

    return {
      ingestionId,
      total: recordCount,
      successes,
      failures,
      dryRun: config.dryRun,
      records: results,
    };
  }

  private async executeSubmission(
    em: EntityManager,
    mapped: MappedSubmission,
    dryRun: boolean,
  ): Promise<QuestionnaireSubmission> {
    if (dryRun) {
      let submission: QuestionnaireSubmission | undefined;
      try {
        await em.transactional(async () => {
          submission =
            await this.questionnaireService.submitQuestionnaire(mapped);
          throw new DryRunRollbackError();
        });
      } catch (e: unknown) {
        if (!(e instanceof DryRunRollbackError)) {
          throw e;
        }
      }
      return submission!;
    }

    return this.questionnaireService.submitQuestionnaire(mapped);
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    const signal = AbortSignal.timeout(ms);
    return new Promise((resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(new Error('Record processing timed out')),
        { once: true },
      );
      promise.then(resolve).catch(reject);
    });
  }
}
