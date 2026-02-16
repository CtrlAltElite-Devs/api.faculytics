import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import {
  Questionnaire,
  QuestionnaireVersion,
  QuestionnaireSubmission,
  QuestionnaireAnswer,
  User,
  Semester,
  Course,
  Department,
  Program,
  Campus,
} from '../../../entities/index.entity';
import {
  QuestionnaireStatus,
  QuestionnaireSchemaSnapshot,
  RespondentRole,
  SectionNode,
  QuestionnaireType,
} from '../questionnaire.types';
import { QuestionnaireSchemaValidator } from './questionnaire-schema.validator';
import { ScoringService } from './scoring.service';
import { EntityManager } from '@mikro-orm/postgresql';
import { UserRole } from '../../auth/roles.enum';

@Injectable()
export class QuestionnaireService {
  constructor(
    @InjectRepository(Questionnaire)
    private readonly questionnaireRepo: EntityRepository<Questionnaire>,
    @InjectRepository(QuestionnaireVersion)
    private readonly versionRepo: EntityRepository<QuestionnaireVersion>,
    @InjectRepository(QuestionnaireSubmission)
    private readonly submissionRepo: EntityRepository<QuestionnaireSubmission>,
    private readonly validator: QuestionnaireSchemaValidator,
    private readonly scoringService: ScoringService,
    private readonly em: EntityManager,
  ) {}

  async createQuestionnaire(data: { title: string; type: QuestionnaireType }) {
    const questionnaire = this.questionnaireRepo.create({
      title: data.title,
      type: data.type,
      status: QuestionnaireStatus.DRAFT,
    });
    this.em.persist(questionnaire);
    await this.em.flush();
    return questionnaire;
  }

  async createVersion(
    questionnaireId: string,
    schema: QuestionnaireSchemaSnapshot,
  ) {
    const questionnaire =
      await this.questionnaireRepo.findOneOrFail(questionnaireId);

    // Determine next version number
    const latestVersion = await this.versionRepo.findOne(
      { questionnaire },
      { orderBy: { versionNumber: 'DESC' } },
    );
    const nextVersionNumber = latestVersion
      ? latestVersion.versionNumber + 1
      : 1;

    const version = this.versionRepo.create({
      questionnaire,
      versionNumber: nextVersionNumber,
      schemaSnapshot: schema,
      isActive: false,
    });

    this.em.persist(version);
    await this.em.flush();
    return version;
  }

  async publishVersion(versionId: string) {
    const version = await this.versionRepo.findOneOrFail(versionId, {
      populate: ['questionnaire'],
    });

    if (version.publishedAt) {
      throw new BadRequestException('Version is already published.');
    }

    // Validate schema before publishing
    await this.validator.validate(version.schemaSnapshot);

    // Deactivate current active version
    const currentActive = await this.versionRepo.findOne({
      questionnaire: version.questionnaire,
      isActive: true,
    });
    if (currentActive) {
      currentActive.isActive = false;
    }

    version.isActive = true;
    version.publishedAt = new Date();
    version.questionnaire.status = QuestionnaireStatus.PUBLISHED;

    await this.em.flush();
    return version;
  }

  async submitQuestionnaire(data: {
    versionId: string;
    respondentId: string;
    facultyId: string;
    semesterId: string;
    courseId?: string;
    answers: Record<string, number>; // questionId -> numericValue
    qualitativeComment?: string;
  }) {
    const version = await this.versionRepo.findOneOrFail(data.versionId, {
      populate: ['questionnaire'],
    });

    if (!version.isActive) {
      throw new BadRequestException(
        'Cannot submit to an inactive questionnaire version.',
      );
    }

    const respondent = await this.em.findOneOrFail(User, data.respondentId);
    const faculty = await this.em.findOneOrFail(User, data.facultyId, {
      populate: ['campus', 'department', 'program'],
    });
    const semester = await this.em.findOneOrFail(Semester, data.semesterId, {
      populate: ['campus'],
    });

    let course: Course | null = null;
    let department: Department | null = null;
    let program: Program | null = null;
    let campus: Campus | null = null;

    if (data.courseId) {
      course = await this.em.findOneOrFail(Course, data.courseId, {
        populate: ['program.department'],
      });
      program = course.program;
      department = program.department;
    } else {
      department = faculty.department || null;
      program = faculty.program || null;
    }

    campus = faculty.campus || semester.campus;

    if (!campus) {
      throw new BadRequestException('Campus context not found for submission.');
    }
    if (!department || !program) {
      throw new BadRequestException(
        'Department or Program context not found for submission.',
      );
    }

    // Scoring
    const scores = this.scoringService.calculateScores(
      version.schemaSnapshot,
      data.answers,
    );

    // Create Submission with Snapshots
    const submission = this.submissionRepo.create({
      questionnaireVersion: version,
      respondent,
      faculty,
      respondentRole: respondent.roles.includes(UserRole.DEAN)
        ? RespondentRole.DEAN
        : RespondentRole.STUDENT,
      semester,
      course: course || undefined,
      department,
      program,
      campus,
      totalScore: scores.totalScore,
      normalizedScore: scores.normalizedScore,
      qualitativeComment: data.qualitativeComment,
      submittedAt: new Date(),

      // Snapshots
      facultyNameSnapshot:
        faculty.fullName || `${faculty.firstName} ${faculty.lastName}`,
      departmentCodeSnapshot: department.code,
      departmentNameSnapshot: department.name || department.code,
      programCodeSnapshot: program.code,
      programNameSnapshot: program.name || program.code,
      campusCodeSnapshot: campus.code,
      campusNameSnapshot: campus.name || campus.code,
      courseCodeSnapshot: course?.shortname || undefined,
      courseTitleSnapshot: course?.fullname || undefined,
      semesterCodeSnapshot: semester.code,
      semesterLabelSnapshot: semester.label || semester.code,
      academicYearSnapshot: semester.academicYear || 'N/A',
    });

    // Create Answers
    for (const [questionId, value] of Object.entries(data.answers)) {
      const meta = this.findQuestionMeta(version.schemaSnapshot, questionId);

      const answer = this.em.create(QuestionnaireAnswer, {
        submission,
        questionId,
        sectionId: meta.sectionId,
        dimensionCode: meta.dimensionCode,
        numericValue: value,
      });
      submission.answers.add(answer);
    }

    this.em.persist(submission);
    await this.em.flush();
    return submission;
  }

  private findQuestionMeta(
    schema: QuestionnaireSchemaSnapshot,
    questionId: string,
  ) {
    for (const section of schema.sections) {
      const meta = this.searchInSection(section, questionId);
      if (meta) return meta;
    }
    throw new BadRequestException(
      `Question ID ${questionId} not found in schema.`,
    );
  }

  private searchInSection(
    section: SectionNode,
    questionId: string,
  ): { sectionId: string; dimensionCode: string } | null {
    if (section.questions) {
      const question = section.questions.find((q) => q.id === questionId);
      if (question) {
        return { sectionId: section.id, dimensionCode: question.dimensionCode };
      }
    }
    if (section.sections) {
      for (const subSection of section.sections) {
        const meta = this.searchInSection(subSection, questionId);
        if (meta) return meta;
      }
    }
    return null;
  }
}
