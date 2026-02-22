import { Injectable, BadRequestException } from '@nestjs/common';
import {
  QuestionnaireSchemaSnapshot,
  SectionNode,
} from '../lib/questionnaire.types';

@Injectable()
export class ScoringService {
  calculateScores(
    schema: QuestionnaireSchemaSnapshot,
    answers: Record<string, number>, // questionId -> numericValue
  ) {
    const maxScore = schema.meta.maxScore;
    if (!maxScore || maxScore <= 0) {
      throw new BadRequestException(
        'Invalid maxScore in questionnaire schema.',
      );
    }

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

    const normalizedScore = (totalScore / maxScore) * 100;

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
