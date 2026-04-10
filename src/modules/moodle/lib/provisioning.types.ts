export const MOODLE_PROVISION_BATCH_SIZE = 50;

export interface SeedContext {
  campus: string;
  department: string;
  startDate: string;
  endDate: string;
  startYear: string;
  endYear: string;
  startYY: string;
  endYY: string;
}

export interface CurriculumRow {
  courseCode: string;
  descriptiveTitle: string;
  program: string;
  semester: string;
}

export interface CoursePreviewRow {
  shortname: string;
  fullname: string;
  categoryPath: string;
  categoryId: number;
  startDate: string;
  endDate: string;
  program: string;
  semester: string;
  courseCode: string;
}

export interface ConfirmedCourseRow {
  courseCode: string;
  descriptiveTitle: string;
  program: string;
  semester: string;
  categoryId: number;
}

export interface SkippedRow {
  rowNumber: number;
  courseCode: string;
  reason: string;
}

export interface ParseError {
  rowNumber: number;
  message: string;
}

export interface SeedUserRecord {
  username: string;
  firstname: string;
  lastname: string;
  email: string;
  password: string;
}

export interface ProvisionCategoriesInput {
  campuses: string[];
  semesters: number[];
  startDate: string;
  endDate: string;
  departments: { code: string; programs: string[] }[];
}

export interface QuickCourseInput {
  courseCode: string;
  descriptiveTitle: string;
  campus: string;
  department: string;
  program: string;
  semester: number;
  startDate: string;
  endDate: string;
}

export interface SeedUsersInput {
  count: number;
  role: 'student' | 'faculty';
  campus: string;
  courseIds: number[];
}

export interface ProvisionDetailItem {
  name: string;
  status: 'created' | 'skipped' | 'error';
  reason?: string;
  moodleId?: number;
}

export interface ProvisionResult {
  created: number;
  skipped: number;
  errors: number;
  details: ProvisionDetailItem[];
  durationMs: number;
  syncCompleted?: boolean;
}

export interface CoursePreviewResult {
  valid: CoursePreviewRow[];
  skipped: SkippedRow[];
  errors: ParseError[];
  shortnameNote: string;
}

export interface SeedUsersResult {
  usersCreated: number;
  usersFailed: number;
  enrolmentsCreated: number;
  warnings: string[];
  durationMs: number;
}
