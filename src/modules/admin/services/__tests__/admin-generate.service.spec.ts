import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdminGenerateService } from '../admin-generate.service';
import { CommentGeneratorService } from '../comment-generator.service';
import { QuestionnaireService } from 'src/modules/questionnaires/services/questionnaire.service';
import type { QuestionnaireSchemaSnapshot } from 'src/modules/questionnaires/lib/questionnaire.types';
import { QuestionType } from 'src/modules/questionnaires/lib/questionnaire.types';

const mockSchema: QuestionnaireSchemaSnapshot = {
  meta: {
    questionnaireType: 'FACULTY_IN_CLASSROOM',
    scoringModel: 'SECTION_WEIGHTED',
    version: 1,
    maxScore: 5,
  },
  sections: [
    {
      id: 'sec-1',
      title: 'Teaching Quality',
      order: 1,
      weight: 100,
      questions: [
        {
          id: 'q1',
          text: 'The instructor explains clearly.',
          type: QuestionType.LIKERT_1_5,
          dimensionCode: 'TEACH',
          required: true,
          order: 1,
        },
        {
          id: 'q2',
          text: 'The instructor is prepared.',
          type: QuestionType.LIKERT_1_5,
          dimensionCode: 'TEACH',
          required: true,
          order: 2,
        },
      ],
    },
  ],
  qualitativeFeedback: { enabled: true, required: true, maxLength: 500 },
};

const mockVersion = {
  id: 'version-1',
  versionNumber: 1,
  isActive: true,
  schemaSnapshot: mockSchema,
  questionnaire: { type: { id: 'type-1' } },
};

const mockFaculty = {
  id: 'faculty-1',
  userName: 'prof.santos',
  firstName: 'Juan',
  lastName: 'Santos',
  fullName: 'Juan Santos',
};

const mockSemester = {
  id: 'sem-1',
  code: 'S22526',
  label: '2nd Semester',
  academicYear: '2025-2026',
};

const mockCourse = {
  id: 'course-1',
  shortname: 'CS101',
  fullname: 'Intro to Programming',
  program: {
    department: {
      semester: mockSemester,
    },
  },
};

const makeStudent = (index: number) => ({
  id: `student-${index}`,
  userName: `student${index}`,
  firstName: `First${index}`,
  lastName: `Last${index}`,
  fullName: `First${index} Last${index}`,
});

const mockStudentEnrollments = [1, 2, 3].map((i) => ({
  user: makeStudent(i),
  course: mockCourse,
  role: 'student',
  isActive: true,
}));

describe('AdminGenerateService', () => {
  let service: AdminGenerateService;
  let em: { findOne: jest.Mock; find: jest.Mock; clear: jest.Mock };
  let commentGenerator: { GenerateComments: jest.Mock };
  let questionnaireService: { submitQuestionnaire: jest.Mock };

  beforeEach(async () => {
    em = {
      findOne: jest.fn(),
      find: jest.fn(),
      clear: jest.fn(),
    };

    commentGenerator = {
      GenerateComments: jest.fn(),
    };

    questionnaireService = {
      submitQuestionnaire: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGenerateService,
        { provide: EntityManager, useValue: em },
        { provide: CommentGeneratorService, useValue: commentGenerator },
        { provide: QuestionnaireService, useValue: questionnaireService },
      ],
    }).compile();

    service = module.get(AdminGenerateService);
  });

  describe('GeneratePreview', () => {
    const dto = {
      versionId: 'version-1',
      facultyUsername: 'prof.santos',
      courseShortname: 'CS101',
    };

    function setupHappyPath() {
      em.findOne
        .mockResolvedValueOnce(mockVersion as any) // version
        .mockResolvedValueOnce(mockFaculty as any) // faculty
        .mockResolvedValueOnce(mockCourse as any) // course
        .mockResolvedValueOnce({ id: 'enroll-1' } as any); // faculty enrollment

      em.find
        .mockResolvedValueOnce(mockStudentEnrollments as any) // student enrollments
        .mockResolvedValueOnce([] as any); // existing submissions (none)

      commentGenerator.GenerateComments.mockResolvedValue([
        'Great class!',
        'Maganda.',
        'Very helpful.',
      ]);
    }

    it('should return preview with correct metadata and rows for happy path', async () => {
      setupHappyPath();

      const result = await service.GeneratePreview(dto);

      expect(result.metadata.totalEnrolled).toBe(3);
      expect(result.metadata.alreadySubmitted).toBe(0);
      expect(result.metadata.availableStudents).toBe(3);
      expect(result.metadata.generatingCount).toBe(3);
      expect(result.metadata.maxScore).toBe(5);
      expect(result.metadata.faculty.username).toBe('prof.santos');
      expect(result.metadata.course.shortname).toBe('CS101');
      expect(result.rows).toHaveLength(3);
      expect(result.questions).toHaveLength(2);
    });

    it('should generate answers in valid range [1, maxScore]', async () => {
      setupHappyPath();

      const result = await service.GeneratePreview(dto);

      for (const row of result.rows) {
        for (const val of Object.values(row.answers)) {
          expect(val).toBeGreaterThanOrEqual(1);
          expect(val).toBeLessThanOrEqual(5);
          expect(Number.isInteger(val)).toBe(true);
        }
      }
    });

    it('should include questions with section names', async () => {
      setupHappyPath();

      const result = await service.GeneratePreview(dto);

      expect(result.questions[0].sectionName).toBe('Teaching Quality');
      expect(result.questions[0].id).toBe('q1');
    });

    it('should generate comments when qualitativeFeedback is enabled', async () => {
      setupHappyPath();

      const result = await service.GeneratePreview(dto);

      expect(commentGenerator.GenerateComments).toHaveBeenCalledWith(3, {
        courseName: 'Intro to Programming',
        facultyName: 'Juan Santos',
        maxScore: 5,
        maxLength: 500,
      });
      expect(result.rows[0].comment).toBe('Great class!');
    });

    it('should throw NotFoundException when version not found', async () => {
      em.findOne.mockResolvedValueOnce(null);

      await expect(service.GeneratePreview(dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for inactive version', async () => {
      em.findOne.mockResolvedValueOnce({
        ...mockVersion,
        isActive: false,
      } as any);

      await expect(service.GeneratePreview(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when faculty not enrolled as editing teacher', async () => {
      em.findOne
        .mockResolvedValueOnce(mockVersion as any)
        .mockResolvedValueOnce(mockFaculty as any)
        .mockResolvedValueOnce(mockCourse as any)
        .mockResolvedValueOnce(null); // no enrollment

      await expect(service.GeneratePreview(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when semester hierarchy is incomplete', async () => {
      em.findOne
        .mockResolvedValueOnce(mockVersion as any)
        .mockResolvedValueOnce(mockFaculty as any)
        .mockResolvedValueOnce({
          ...mockCourse,
          program: { department: { semester: null } },
        } as any)
        .mockResolvedValueOnce({ id: 'enroll-1' } as any);

      await expect(service.GeneratePreview(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when all students have already submitted', async () => {
      em.findOne
        .mockResolvedValueOnce(mockVersion as any)
        .mockResolvedValueOnce(mockFaculty as any)
        .mockResolvedValueOnce(mockCourse as any)
        .mockResolvedValueOnce({ id: 'enroll-1' } as any);

      em.find
        .mockResolvedValueOnce(mockStudentEnrollments as any) // student enrollments
        .mockResolvedValueOnce(
          // all 3 students already submitted
          [1, 2, 3].map((i) => ({ respondent: { id: `student-${i}` } })) as any,
        );

      await expect(service.GeneratePreview(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should skip comment generation when qualitativeFeedback is not enabled', async () => {
      const versionNoComments = {
        ...mockVersion,
        schemaSnapshot: {
          ...mockSchema,
          qualitativeFeedback: {
            enabled: false,
            required: false,
            maxLength: 500,
          },
        },
      };

      em.findOne
        .mockResolvedValueOnce(versionNoComments as any)
        .mockResolvedValueOnce(mockFaculty as any)
        .mockResolvedValueOnce(mockCourse as any)
        .mockResolvedValueOnce({ id: 'enroll-1' } as any);

      em.find
        .mockResolvedValueOnce(mockStudentEnrollments as any)
        .mockResolvedValueOnce([] as any);

      const result = await service.GeneratePreview(dto);

      expect(commentGenerator.GenerateComments).not.toHaveBeenCalled();
      expect(result.rows[0].comment).toBeUndefined();
    });
  });

  describe('CommitSubmissions', () => {
    const rows = [
      {
        externalId: 'gen_student1_123_0',
        username: 'student1',
        facultyUsername: 'prof.santos',
        courseShortname: 'CS101',
        answers: { q1: 4, q2: 5 },
        comment: 'Great class!',
      },
      {
        externalId: 'gen_student2_123_1',
        username: 'student2',
        facultyUsername: 'prof.santos',
        courseShortname: 'CS101',
        answers: { q1: 3, q2: 4 },
        comment: 'Good.',
      },
    ];

    const dto = { versionId: 'version-1', rows };

    function setupCommitHappyPath() {
      em.findOne
        .mockResolvedValueOnce(mockVersion as any) // version
        .mockResolvedValueOnce(mockFaculty as any) // faculty
        .mockResolvedValueOnce(mockCourse as any) // course
        .mockResolvedValueOnce(makeStudent(1) as any) // student1
        .mockResolvedValueOnce(makeStudent(2) as any); // student2

      questionnaireService.submitQuestionnaire
        .mockResolvedValueOnce({ id: 'sub-1' } as any)
        .mockResolvedValueOnce({ id: 'sub-2' } as any);
    }

    it('should commit all rows successfully', async () => {
      setupCommitHappyPath();

      const result = await service.CommitSubmissions(dto);

      expect(result.total).toBe(2);
      expect(result.successes).toBe(2);
      expect(result.failures).toBe(0);
      expect(result.dryRun).toBe(false);
      expect(result.records).toHaveLength(2);
      expect(result.records[0].success).toBe(true);
      expect(result.records[0].internalId).toBe('sub-1');
    });

    it('should map comment to qualitativeComment in submitQuestionnaire call', async () => {
      setupCommitHappyPath();

      await service.CommitSubmissions(dto);

      expect(questionnaireService.submitQuestionnaire).toHaveBeenCalledWith(
        expect.objectContaining({
          qualitativeComment: 'Great class!',
          versionId: 'version-1',
          facultyId: 'faculty-1',
          semesterId: 'sem-1',
          courseId: 'course-1',
        }),
      );
    });

    it('should handle partial failure with ConflictException', async () => {
      em.findOne
        .mockResolvedValueOnce(mockVersion as any)
        .mockResolvedValueOnce(mockFaculty as any)
        .mockResolvedValueOnce(mockCourse as any)
        .mockResolvedValueOnce(makeStudent(1) as any)
        .mockResolvedValueOnce(makeStudent(2) as any);

      questionnaireService.submitQuestionnaire
        .mockRejectedValueOnce(new ConflictException('Duplicate submission'))
        .mockResolvedValueOnce({ id: 'sub-2' } as any);

      const result = await service.CommitSubmissions(dto);

      expect(result.successes).toBe(1);
      expect(result.failures).toBe(1);
      expect(result.records[0].success).toBe(false);
      expect(result.records[0].error).toContain('Duplicate submission');
      expect(result.records[1].success).toBe(true);
      expect(em.clear).toHaveBeenCalled();
    });

    it('should handle partial failure with ForbiddenException', async () => {
      em.findOne
        .mockResolvedValueOnce(mockVersion as any)
        .mockResolvedValueOnce(mockFaculty as any)
        .mockResolvedValueOnce(mockCourse as any)
        .mockResolvedValueOnce(makeStudent(1) as any)
        .mockResolvedValueOnce(makeStudent(2) as any);

      questionnaireService.submitQuestionnaire
        .mockRejectedValueOnce(new ForbiddenException('Not enrolled'))
        .mockResolvedValueOnce({ id: 'sub-2' } as any);

      const result = await service.CommitSubmissions(dto);

      expect(result.successes).toBe(1);
      expect(result.failures).toBe(1);
      expect(result.records[0].success).toBe(false);
      expect(em.clear).toHaveBeenCalled();
    });

    it('should throw NotFoundException when version not found', async () => {
      em.findOne.mockResolvedValueOnce(null);

      await expect(service.CommitSubmissions(dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should record failure when student not found', async () => {
      em.findOne
        .mockResolvedValueOnce(mockVersion as any)
        .mockResolvedValueOnce(mockFaculty as any)
        .mockResolvedValueOnce(mockCourse as any)
        .mockResolvedValueOnce(null) // student1 not found
        .mockResolvedValueOnce(makeStudent(2) as any);

      questionnaireService.submitQuestionnaire.mockResolvedValueOnce({
        id: 'sub-2',
      } as any);

      const result = await service.CommitSubmissions(dto);

      expect(result.successes).toBe(1);
      expect(result.failures).toBe(1);
      expect(result.records[0].success).toBe(false);
      expect(result.records[0].error).toContain('student1');
    });
  });
});
