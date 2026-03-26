export const DEFAULT_DIMENSIONS: {
  code: string;
  displayName: string;
  questionnaireType: string;
}[] = [
  // FACULTY_IN_CLASSROOM (one per leaf section)
  {
    code: 'ILO',
    displayName: 'Intended Learning Outcomes',
    questionnaireType: 'FACULTY_IN_CLASSROOM',
  },
  {
    code: 'CONTENTS',
    displayName: 'Contents',
    questionnaireType: 'FACULTY_IN_CLASSROOM',
  },
  {
    code: 'PREPARATION_PHASE',
    displayName: 'Preparation Phase',
    questionnaireType: 'FACULTY_IN_CLASSROOM',
  },
  {
    code: 'PRESENTATION',
    displayName: 'Presentation-Development Phase',
    questionnaireType: 'FACULTY_IN_CLASSROOM',
  },
  {
    code: 'ASSESSMENT_PHASE',
    displayName: 'Assessment Phase',
    questionnaireType: 'FACULTY_IN_CLASSROOM',
  },
  {
    code: 'CLASSROOM_MGMT',
    displayName: 'Classroom Management',
    questionnaireType: 'FACULTY_IN_CLASSROOM',
  },
  {
    code: 'TEACHER_QUALITIES',
    displayName: 'Teacher Qualities',
    questionnaireType: 'FACULTY_IN_CLASSROOM',
  },

  // FACULTY_OUT_OF_CLASSROOM (one per leaf section)
  {
    code: 'PUNCTUAL_SUBMISSION',
    displayName: 'Punctual Submission',
    questionnaireType: 'FACULTY_OUT_OF_CLASSROOM',
  },
  {
    code: 'QUALITY_REQUIREMENTS',
    displayName: 'Quality of Submitted Requirements',
    questionnaireType: 'FACULTY_OUT_OF_CLASSROOM',
  },
  {
    code: 'SCHOOL_POLICIES',
    displayName: 'Adherence to School Policies',
    questionnaireType: 'FACULTY_OUT_OF_CLASSROOM',
  },
  {
    code: 'PARTICIPATION',
    displayName: 'Attendance/Participation in School/Department Activities',
    questionnaireType: 'FACULTY_OUT_OF_CLASSROOM',
  },
  {
    code: 'STUDENT_SUPERVISION',
    displayName: "Supervision of Students' Out-of-Classroom Activities",
    questionnaireType: 'FACULTY_OUT_OF_CLASSROOM',
  },
  {
    code: 'PROFESSIONAL_GROWTH',
    displayName: 'Professional/Personal Growth',
    questionnaireType: 'FACULTY_OUT_OF_CLASSROOM',
  },
  {
    code: 'RESEARCH_COMMUNITY',
    displayName:
      'Involvement in Research and Community Service/Outreach Activities',
    questionnaireType: 'FACULTY_OUT_OF_CLASSROOM',
  },

  // FACULTY_FEEDBACK (one per leaf section)
  {
    code: 'PREPARATION',
    displayName: 'Preparation',
    questionnaireType: 'FACULTY_FEEDBACK',
  },
  {
    code: 'TEACHING_LEARNING',
    displayName: 'Teaching and Learning Process',
    questionnaireType: 'FACULTY_FEEDBACK',
  },
  {
    code: 'ASSESSMENT',
    displayName: 'Assessment',
    questionnaireType: 'FACULTY_FEEDBACK',
  },
  {
    code: 'LEARNING_ENVIRONMENT',
    displayName: 'Learning Environment',
    questionnaireType: 'FACULTY_FEEDBACK',
  },
  {
    code: 'PROFESSIONALISM',
    displayName: "Teacher's Professionalism",
    questionnaireType: 'FACULTY_FEEDBACK',
  },
];
