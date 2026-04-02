import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { FacultyReportResponseDto } from 'src/modules/analytics/dto/responses/faculty-report.response.dto';
import { ReportCommentDto } from 'src/modules/analytics/dto/responses/faculty-report-comments.response.dto';

@Injectable()
export class PdfService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browser: puppeteer.Browser | null = null;
  private compiledTemplate: Handlebars.TemplateDelegate | null = null;
  private cssContent: string | null = null;
  private relaunchPromise: Promise<void> | null = null;

  async onModuleInit(): Promise<void> {
    await this.launchBrowser();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  async GenerateFacultyEvaluationPdf(
    data: FacultyReportResponseDto,
    comments: ReportCommentDto[],
  ): Promise<Buffer> {
    const template = this.getCompiledTemplate();
    const css = this.getCss();

    const html = template({
      faculty: data.faculty,
      semester: data.semester,
      questionnaireType: data.questionnaireType,
      submissionCount: data.submissionCount,
      sections: data.sections,
      overallRating: data.overallRating,
      overallInterpretation: data.overallInterpretation,
      comments,
      hasComments: comments.length > 0,
      css,
    });

    const page = await this.createPage();
    try {
      page.setDefaultTimeout(30000);
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await page.close().catch(() => {});
    }
  }

  private async createPage(): Promise<puppeteer.Page> {
    try {
      return await this.getBrowser().newPage();
    } catch {
      this.logger.warn('Browser crashed, attempting relaunch...');
      // Mutex: if another job is already relaunching, wait for that instead
      if (!this.relaunchPromise) {
        this.relaunchPromise = this.launchBrowser().finally(() => {
          this.relaunchPromise = null;
        });
      }
      await this.relaunchPromise;
      return await this.getBrowser().newPage();
    }
  }

  private getBrowser(): puppeteer.Browser {
    if (!this.browser) {
      throw new Error('Puppeteer browser is not initialized');
    }
    return this.browser;
  }

  private async launchBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
    this.logger.log('Puppeteer browser launched');
  }

  private getCompiledTemplate(): Handlebars.TemplateDelegate {
    if (!this.compiledTemplate) {
      const templatePath = path.join(
        process.cwd(),
        'dist',
        'modules',
        'reports',
        'templates',
        'faculty-evaluation.hbs',
      );
      const templateSource = fs.readFileSync(templatePath, 'utf-8');
      this.compiledTemplate = Handlebars.compile(templateSource);
    }
    return this.compiledTemplate;
  }

  private getCss(): string {
    if (!this.cssContent) {
      const cssPath = path.join(
        process.cwd(),
        'dist',
        'modules',
        'reports',
        'templates',
        'report.css',
      );
      this.cssContent = fs.readFileSync(cssPath, 'utf-8');
    }
    return this.cssContent;
  }
}
