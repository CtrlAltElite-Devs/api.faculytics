import type {
  QuestionnaireSchemaSnapshot,
  SectionNode,
} from 'src/modules/questionnaires/lib/questionnaire.types';

export interface QuestionWithSection {
  id: string;
  text: string;
  type: string;
  dimensionCode: string;
  required: boolean;
  order: number;
  sectionName: string;
}

/**
 * Iterative traversal that flattens all questions from a schema snapshot,
 * tracking the parent section title for each question.
 * Extends the pattern from QuestionnaireService.GetAllQuestions().
 */
export function GetAllQuestionsWithSections(
  schema: QuestionnaireSchemaSnapshot,
): QuestionWithSection[] {
  const questions: QuestionWithSection[] = [];
  const stack: { section: SectionNode; sectionName: string }[] =
    schema.sections.map((s) => ({ section: s, sectionName: s.title }));

  while (stack.length > 0) {
    const { section, sectionName } = stack.pop()!;

    if (section.questions) {
      for (const q of section.questions) {
        questions.push({
          id: q.id,
          text: q.text,
          type: q.type,
          dimensionCode: q.dimensionCode,
          required: q.required,
          order: q.order,
          sectionName,
        });
      }
    }

    if (section.sections) {
      stack.push(
        ...section.sections.map((s) => ({ section: s, sectionName: s.title })),
      );
    }
  }

  return questions;
}
