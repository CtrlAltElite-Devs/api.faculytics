import { Injectable } from '@nestjs/common';
import {
  QuestionnaireSchemaSnapshot,
  SectionNode,
} from '../questionnaire.types';

@Injectable()
export class ScoringService {
  calculateScores(
    schema: QuestionnaireSchemaSnapshot,
    answers: Record<string, number>, // questionId -> numericValue
  ) {
    const leafSections: SectionNode[] = [];
    this.findLeafSections(schema.sections, leafSections);

    let totalScore = 0;

    const sectionBreakdown = leafSections.map((section) => {
      const questionIds = section.questions!.map((q) => q.id);
      const scores = questionIds
        .map((id) => answers[id])
        .filter((val) => val !== undefined);

      const sectionAverage =
        scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0;

      const weight = section.weight || 0;
      const sectionContribution = sectionAverage * (weight / 100);

      totalScore += sectionContribution;

      return {
        sectionId: section.id,
        sectionTitle: section.title,
        average: sectionAverage,
        weight: weight,
        contribution: sectionContribution,
      };
    });

    // Normalized score: Assuming LIKERT 1-5, normalize to 100
    // If the max score is 5, normalized = (totalScore / 5) * 100
    // However, the scoring model might vary. For now, let's assume totalScore is the weighted average.
    // If all questions are 5, totalScore will be 5.
    const normalizedScore = (totalScore / 5) * 100;

    return {
      totalScore,
      normalizedScore,
      sectionBreakdown,
    };
  }

  private findLeafSections(
    sections: SectionNode[],
    leafSections: SectionNode[],
  ) {
    for (const section of sections) {
      if (!section.sections || section.sections.length === 0) {
        leafSections.push(section);
      } else {
        this.findLeafSections(section.sections, leafSections);
      }
    }
  }
}
