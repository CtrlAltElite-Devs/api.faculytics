import { FACULTY_FEEDBACK_SCHEMA_V1 } from '../faculty-feedback.schema';
import { FACULTY_IN_CLASSROOM_SCHEMA_V1 } from '../faculty-in-classroom.schema';
import { FACULTY_OUT_OF_CLASSROOM_SCHEMA_V1 } from '../faculty-out-of-classroom.schema';
import { DEFAULT_DIMENSIONS } from '../../dimension.constants';
import {
  QuestionnaireSchemaSnapshot,
  SectionNode,
} from '../../questionnaire.types';

function collectLeafSections(sections: SectionNode[]): SectionNode[] {
  const leaves: SectionNode[] = [];
  for (const section of sections) {
    if (section.sections && section.sections.length > 0) {
      leaves.push(...collectLeafSections(section.sections));
    } else {
      leaves.push(section);
    }
  }
  return leaves;
}

function collectAllIds(sections: SectionNode[]): string[] {
  const ids: string[] = [];
  for (const section of sections) {
    ids.push(section.id);
    if (section.questions) {
      ids.push(...section.questions.map((q) => q.id));
    }
    if (section.sections) {
      ids.push(...collectAllIds(section.sections));
    }
  }
  return ids;
}

function collectAllDimensionCodes(sections: SectionNode[]): string[] {
  const codes: string[] = [];
  for (const section of sections) {
    if (section.questions) {
      codes.push(...section.questions.map((q) => q.dimensionCode));
    }
    if (section.sections) {
      codes.push(...collectAllDimensionCodes(section.sections));
    }
  }
  return codes;
}

function getMaxNestingDepth(sections: SectionNode[], currentDepth = 1): number {
  let max = currentDepth;
  for (const section of sections) {
    if (section.sections && section.sections.length > 0) {
      const childDepth = getMaxNestingDepth(section.sections, currentDepth + 1);
      if (childDepth > max) max = childDepth;
    }
  }
  return max;
}

function isParentSection(section: SectionNode): boolean {
  return !!(section.sections && section.sections.length > 0);
}

describe.each([
  ['FACULTY_FEEDBACK', FACULTY_FEEDBACK_SCHEMA_V1],
  ['FACULTY_IN_CLASSROOM', FACULTY_IN_CLASSROOM_SCHEMA_V1],
  ['FACULTY_OUT_OF_CLASSROOM', FACULTY_OUT_OF_CLASSROOM_SCHEMA_V1],
])('%s schema', (_name: string, schema: QuestionnaireSchemaSnapshot) => {
  it('leaf weights sum to exactly 100', () => {
    const leaves = collectLeafSections(schema.sections);
    const totalWeight = leaves.reduce((sum, s) => sum + (s.weight ?? 0), 0);
    expect(totalWeight).toBe(100);
  });

  it('all section and question IDs are unique', () => {
    const ids = collectAllIds(schema.sections);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all dimension codes match DEFAULT_DIMENSIONS', () => {
    const validCodes = new Set(DEFAULT_DIMENSIONS.map((d) => d.code));
    const usedCodes = collectAllDimensionCodes(schema.sections);
    for (const code of usedCodes) {
      expect(validCodes).toContain(code);
    }
  });

  it('parent sections have no weight or questions; leaf sections have both', () => {
    const checkSections = (sections: SectionNode[]) => {
      for (const section of sections) {
        if (isParentSection(section)) {
          expect(section.weight).toBeUndefined();
          expect(section.questions).toBeUndefined();
        } else {
          expect(section.weight).toBeDefined();
          expect(section.questions).toBeDefined();
          expect(section.questions!.length).toBeGreaterThan(0);
        }
        if (section.sections) {
          checkSections(section.sections);
        }
      }
    };
    checkSections(schema.sections);
  });
});

describe('FACULTY_IN_CLASSROOM schema nesting', () => {
  it('has correct nesting depth (2 levels)', () => {
    const depth = getMaxNestingDepth(FACULTY_IN_CLASSROOM_SCHEMA_V1.sections);
    expect(depth).toBe(2);
  });
});
