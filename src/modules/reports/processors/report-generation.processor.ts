import { Logger, Inject } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { QueueName } from 'src/configurations/common/queue-names';
import { env } from 'src/configurations/index.config';
import { ReportJob } from 'src/entities/report-job.entity';
import { AnalyticsService } from 'src/modules/analytics/analytics.service';
import { PdfService } from '../services/pdf.service';
import {
  StorageProvider,
  STORAGE_PROVIDER,
} from '../interfaces/storage-provider.interface';

export interface ReportJobMessage {
  reportJobId: string;
  facultyId: string;
  semesterId: string;
  questionnaireTypeCode: string;
}

@Processor(QueueName.REPORT_GENERATION, {
  concurrency: env.REPORT_GENERATION_CONCURRENCY,
})
export class ReportGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportGenerationProcessor.name);

  constructor(
    private readonly em: EntityManager,
    private readonly analyticsService: AnalyticsService,
    private readonly pdfService: PdfService,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {
    super();
  }

  async process(job: Job<ReportJobMessage>): Promise<void> {
    const { reportJobId, facultyId, semesterId, questionnaireTypeCode } =
      job.data;

    const fork = this.em.fork();
    const reportJob = await fork.findOneOrFail(ReportJob, reportJobId);
    reportJob.status = 'active';
    await fork.flush();

    // Fetch report data (unscoped — authorization was performed at enqueue time)
    const reportData = await this.analyticsService.GetFacultyReportUnscoped(
      facultyId,
      { semesterId, questionnaireTypeCode },
    );

    // Skip PDF generation if no submissions
    if (reportData.submissionCount === 0) {
      reportJob.status = 'skipped';
      reportJob.completedAt = new Date();
      await fork.flush();
      this.logger.log(
        `Report job ${reportJobId} skipped — no submissions for faculty ${facultyId}`,
      );
      return;
    }

    // Fetch all comments
    const comments = await this.analyticsService.GetAllFacultyReportComments(
      facultyId,
      { semesterId, questionnaireTypeCode },
    );

    // Generate PDF
    const pdfBuffer = await this.pdfService.GenerateFacultyEvaluationPdf(
      reportData,
      comments,
    );

    // Build storage key
    const storageKey = `reports/faculty_evaluation/${semesterId}/${reportJob.batchId ?? reportJob.id}/${facultyId}.pdf`;

    // Upload to R2
    await this.storageProvider.Upload(storageKey, pdfBuffer, 'application/pdf');

    // Update job status
    reportJob.status = 'completed';
    reportJob.storageKey = storageKey;
    reportJob.completedAt = new Date();
    await fork.flush();

    this.logger.log(
      `Report job ${reportJobId} completed — faculty ${facultyId}`,
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ReportJobMessage>, error: Error): Promise<void> {
    const maxAttempts = job.opts.attempts ?? env.BULLMQ_DEFAULT_ATTEMPTS;
    const isFinalAttempt = job.attemptsMade >= maxAttempts;

    this.logger.error(
      `Report job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ` +
        `reportJobId=${job.data.reportJobId}, facultyId=${job.data.facultyId} — ${error.message}`,
    );

    // Only mark as permanently failed on the final attempt — BullMQ will retry otherwise
    if (!isFinalAttempt) return;

    try {
      const fork = this.em.fork();
      const reportJob = await fork.findOne(ReportJob, job.data.reportJobId);
      if (reportJob) {
        reportJob.status = 'failed';
        reportJob.error = error.message;
        await fork.flush();
      }
    } catch (dbError) {
      this.logger.error(
        `Failed to update report job status: ${(dbError as Error).message}`,
      );
    }
  }
}
