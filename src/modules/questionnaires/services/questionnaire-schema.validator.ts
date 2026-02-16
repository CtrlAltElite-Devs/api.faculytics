import { Injectable, BadRequestException } from '@nestjs/common';
import {
  QuestionnaireSchemaSnapshot,
  SectionNode,
} from '../questionnaire.types';
import { DimensionRepository } from '../../../repositories/dimension.repository';

@Injectable()
export class QuestionnaireSchemaValidator {
  constructor(private readonly dimensionRepository: DimensionRepository) {}

  async validate(schema: QuestionnaireSchemaSnapshot): Promise<void> {
    const leafSections: SectionNode[] = [];
    const allSectionIds = new Set<string>();
    const allQuestionIds = new Set<string>();
    const allDimensionCodes = new Set<string>();

    this.traverseSections(
      schema.sections,
      leafSections,
      allSectionIds,
      allQuestionIds,
      allDimensionCodes,
    );

    // 1. Leaf Section Rule & 2. Weight Rule
    let totalWeight = 0;
    for (const section of leafSections) {
      if (section.weight === undefined) {
        throw new BadRequestException(
          `Leaf section "${section.title}" (ID: ${section.id}) must have a weight.`,
        );
      }
      if (!section.questions || section.questions.length === 0) {
        throw new BadRequestException(
          `Leaf section "${section.title}" (ID: ${section.id}) must have at least one question.`,
        );
      }
      totalWeight += section.weight;
    }

    if (totalWeight !== 100) {
      throw new BadRequestException(
        `Sum of leaf section weights must be exactly 100. Current sum: ${totalWeight}`,
      );
    }

    // 3. Question Rule (Handled by traversal - ensuring they only exist in leaves)
    // 4. ID Uniqueness (Handled by traversal)

    // 5. Dimension Rule
    const existingDimensions = await this.dimensionRepository.find({
      code: { $in: Array.from(allDimensionCodes) },
      active: true,
    });

    const existingCodes = new Set(existingDimensions.map((d) => d.code));
    for (const code of allDimensionCodes) {
      if (!existingCodes.has(code)) {
        throw new BadRequestException(
          `Dimension code "${code}" not found or inactive.`,
        );
      }
    }
  }

  private traverseSections(
    sections: SectionNode[],
    leafSections: SectionNode[],
    allSectionIds: Set<string>,
    allQuestionIds: Set<string>,
    allDimensionCodes: Set<string>,
  ) {
    for (const section of sections) {
      if (allSectionIds.has(section.id)) {
        throw new BadRequestException(`Duplicate section ID: ${section.id}`);
      }
      allSectionIds.add(section.id);

      const isLeaf = !section.sections || section.sections.length === 0;

      if (isLeaf) {
        leafSections.push(section);
        if (section.questions) {
          for (const question of section.questions) {
            if (allQuestionIds.has(question.id)) {
              throw new BadRequestException(
                `Duplicate question ID: ${question.id}`,
              );
            }
            allQuestionIds.add(question.id);
            allDimensionCodes.add(question.dimensionCode);
          }
        }
      } else {
        if (section.weight !== undefined) {
          throw new BadRequestException(
            `Non-leaf section "${section.title}" (ID: ${section.id}) must NOT have a weight.`,
          );
        }
        if (section.questions && section.questions.length > 0) {
          throw new BadRequestException(
            `Non-leaf section "${section.title}" (ID: ${section.id}) must NOT have questions.`,
          );
        }
        this.traverseSections(
          section.sections!,
          leafSections,
          allSectionIds,
          allQuestionIds,
          allDimensionCodes,
        );
      }
    }
  }
}
