// --- Mocks must be declared before any import that touches them ---

const mockNewPage = jest.fn();
const mockBrowserClose = jest.fn();
const mockPageSetContent = jest.fn();
const mockPagePdf = jest.fn();
const mockPageClose = jest.fn();

const mockBrowser = {
  newPage: mockNewPage,
  close: mockBrowserClose,
};

const mockPage = {
  setDefaultTimeout: jest.fn(),
  setContent: mockPageSetContent,
  pdf: mockPagePdf,
  close: mockPageClose,
};

const mockLaunch = jest.fn();

jest.mock('puppeteer', () => ({
  launch: (...args: unknown[]) => mockLaunch(...args) as unknown,
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('<html>{{faculty.name}}</html>'),
}));

jest.mock('handlebars', () => {
  const mockTemplateDelegate = jest
    .fn()
    .mockReturnValue('<html>rendered</html>');
  return {
    compile: jest.fn().mockReturnValue(mockTemplateDelegate),
  };
});

import { PdfService } from './pdf.service';
import { FacultyReportResponseDto } from 'src/modules/analytics/dto/responses/faculty-report.response.dto';
import { ReportCommentDto } from 'src/modules/analytics/dto/responses/faculty-report-comments.response.dto';

describe('PdfService', () => {
  let service: PdfService;

  const mockReportData: FacultyReportResponseDto = {
    faculty: { id: 'f-1', name: 'Dr. Smith' },
    semester: {
      id: 's-1',
      code: '2024-1',
      label: 'First Semester',
      academicYear: '2024-2025',
    },
    questionnaireType: { code: 'STUDENT', name: 'Student Evaluation' },
    courseFilter: null,
    submissionCount: 42,
    sections: [
      {
        sectionId: 'sec-1',
        title: 'Teaching Quality',
        order: 1,
        weight: 1,
        questions: [
          {
            questionId: 'q-1',
            order: 1,
            text: 'Clarity of instruction',
            average: 4.5,
            responseCount: 42,
            interpretation: 'Very Satisfactory',
          },
        ],
        sectionAverage: 4.5,
        sectionInterpretation: 'Very Satisfactory',
      },
    ],
    overallRating: 4.5,
    overallInterpretation: 'Very Satisfactory',
  };

  const mockComments: ReportCommentDto[] = [
    { text: 'Great professor!', submittedAt: '2024-06-01' },
    { text: 'Very helpful', submittedAt: '2024-06-02' },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();

    mockLaunch.mockResolvedValue(mockBrowser);
    mockNewPage.mockResolvedValue(mockPage);
    mockPageSetContent.mockResolvedValue(undefined);
    mockPagePdf.mockResolvedValue(Buffer.from('pdf-bytes'));
    mockPageClose.mockResolvedValue(undefined);
    mockBrowserClose.mockResolvedValue(undefined);

    service = new PdfService();
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('GenerateFacultyEvaluationPdf', () => {
    it('should return a Buffer', async () => {
      const result = await service.GenerateFacultyEvaluationPdf(
        mockReportData,
        mockComments,
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(mockNewPage).toHaveBeenCalledTimes(1);
      expect(mockPageSetContent).toHaveBeenCalledWith(expect.any(String), {
        waitUntil: 'networkidle0',
      });
      expect(mockPagePdf).toHaveBeenCalledWith({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      });
      expect(mockPageClose).toHaveBeenCalledTimes(1);
    });

    it('should succeed with empty comments array', async () => {
      const result = await service.GenerateFacultyEvaluationPdf(
        mockReportData,
        [],
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(mockNewPage).toHaveBeenCalledTimes(1);
      expect(mockPagePdf).toHaveBeenCalledTimes(1);
    });
  });

  describe('browser crash recovery', () => {
    it('should relaunch browser when newPage fails then succeed', async () => {
      // First call to newPage throws (simulating a crashed browser)
      mockNewPage
        .mockRejectedValueOnce(new Error('Session closed'))
        .mockResolvedValueOnce(mockPage);

      const result = await service.GenerateFacultyEvaluationPdf(
        mockReportData,
        mockComments,
      );

      expect(result).toBeInstanceOf(Buffer);
      // Initial launch + relaunch after crash
      expect(mockLaunch).toHaveBeenCalledTimes(2);
      // First attempt fails, second succeeds
      expect(mockNewPage).toHaveBeenCalledTimes(2);
    });
  });

  describe('lifecycle hooks', () => {
    it('should launch browser on module init', () => {
      expect(mockLaunch).toHaveBeenCalledWith({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      });
    });

    it('should close browser on module destroy', async () => {
      await service.onModuleDestroy();

      expect(mockBrowserClose).toHaveBeenCalled();
    });
  });
});
