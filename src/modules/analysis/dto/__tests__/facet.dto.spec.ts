import {
  facetFromQuestionnaireCode,
  PRIMARY_QUESTIONNAIRE_CODE_TO_FACET,
} from '../facet.dto';

describe('facetFromQuestionnaireCode', () => {
  it('maps FACULTY_FEEDBACK → facultyFeedback', () => {
    expect(facetFromQuestionnaireCode('FACULTY_FEEDBACK')).toBe(
      'facultyFeedback',
    );
  });

  it('maps FACULTY_IN_CLASSROOM → inClassroom', () => {
    expect(facetFromQuestionnaireCode('FACULTY_IN_CLASSROOM')).toBe(
      'inClassroom',
    );
  });

  it('maps FACULTY_OUT_OF_CLASSROOM → outOfClassroom', () => {
    expect(facetFromQuestionnaireCode('FACULTY_OUT_OF_CLASSROOM')).toBe(
      'outOfClassroom',
    );
  });

  it('maps unknown codes to overall', () => {
    expect(facetFromQuestionnaireCode('SOMETHING_ELSE')).toBe('overall');
  });

  it('maps null/undefined to overall', () => {
    expect(facetFromQuestionnaireCode(null)).toBe('overall');
    expect(facetFromQuestionnaireCode(undefined)).toBe('overall');
  });

  it('PRIMARY_QUESTIONNAIRE_CODE_TO_FACET covers exactly three keys', () => {
    expect(Object.keys(PRIMARY_QUESTIONNAIRE_CODE_TO_FACET).sort()).toEqual(
      [
        'FACULTY_FEEDBACK',
        'FACULTY_IN_CLASSROOM',
        'FACULTY_OUT_OF_CLASSROOM',
      ].sort(),
    );
  });
});
