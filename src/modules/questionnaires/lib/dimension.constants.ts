import { QuestionnaireType } from '../questionnaire.types';

export const DEFAULT_DIMENSIONS = [
  // FACULTY_IN_CLASSROOM
  {
    code: 'PLANNING',
    displayName: 'Planning and Preparation',
    questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM,
  },
  {
    code: 'ENVIRONMENT',
    displayName: 'Classroom Environment',
    questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM,
  },
  {
    code: 'INSTRUCTION',
    displayName: 'Instructional Delivery',
    questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM,
  },
  {
    code: 'PROFESSIONALISM',
    displayName: 'Professional Responsibilities',
    questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM,
  },

  // FACULTY_FEEDBACK (Student feedback)
  {
    code: 'CLARITY',
    displayName: 'Clarity of Instruction',
    questionnaireType: QuestionnaireType.FACULTY_FEEDBACK,
  },
  {
    code: 'ENGAGEMENT',
    displayName: 'Student Engagement',
    questionnaireType: QuestionnaireType.FACULTY_FEEDBACK,
  },
  {
    code: 'FEEDBACK',
    displayName: 'Quality of Feedback',
    questionnaireType: QuestionnaireType.FACULTY_FEEDBACK,
  },
  {
    code: 'ORGANIZATION',
    displayName: 'Course Organization',
    questionnaireType: QuestionnaireType.FACULTY_FEEDBACK,
  },
];
