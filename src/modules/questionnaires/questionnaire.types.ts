export enum QuestionnaireType {
  FACULTY_IN_CLASSROOM = 'FACULTY_IN_CLASSROOM',
  FACULTY_OUT_OF_CLASSROOM = 'FACULTY_OUT_OF_CLASSROOM',
  FACULTY_FEEDBACK = 'FACULTY_FEEDBACK',
}

export enum QuestionType {
  LIKERT_1_5 = 'LIKERT_1_5',
  LIKERT_1_4 = 'LIKERT_1_4',
  LIKERT_1_3 = 'LIKERT_1_3',
  YES_NO = 'YES_NO',
}

export enum QuestionnaireStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum RespondentRole {
  STUDENT = 'STUDENT',
  DEAN = 'DEAN',
}

export enum EnrollmentRole {
  STUDENT = 'student',
  EDITING_TEACHER = 'editingteacher',
}

export interface QuestionNode {
  id: string; // unique within version
  text: string;
  type: QuestionType;
  dimensionCode: string; // registry-backed
  required: boolean;
  order: number;
}

export interface SectionNode {
  id: string; // unique within version
  title: string;
  order: number;
  weight?: number; // ONLY allowed if leaf
  sections?: SectionNode[]; // recursive nesting
  questions?: QuestionNode[]; // only allowed on leaf
}

export interface QuestionnaireSchemaSnapshot {
  meta: {
    questionnaireType: QuestionnaireType;
    scoringModel: 'SECTION_WEIGHTED';
    version: number;
    maxScore: number;
  };
  sections: SectionNode[];
  qualitativeFeedback?: {
    enabled: boolean;
    required: boolean;
    maxLength: number;
  };
}
