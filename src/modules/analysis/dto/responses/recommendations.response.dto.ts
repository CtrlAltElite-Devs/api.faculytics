/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RecommendationRun } from 'src/entities/recommendation-run.entity';
import { ActionCategory, ActionPriority, RunStatus } from '../../enums';
import type { SupportingEvidence } from '../recommendations.dto';
import { FACET_VALUES, type Facet } from '../facet.dto';

export class RecommendedActionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ActionCategory })
  category: ActionCategory;

  @ApiProperty()
  headline: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  actionPlan: string;

  @ApiProperty({ enum: ActionPriority })
  priority: ActionPriority;

  @ApiProperty({
    enum: FACET_VALUES,
    description: 'Derived facet grouping for this action',
  })
  facet: Facet;

  @ApiProperty()
  supportingEvidence: SupportingEvidence;

  @ApiProperty()
  createdAt: string;
}

export class RecommendationsResponseDto {
  @ApiProperty()
  pipelineId: string;

  @ApiPropertyOptional({ nullable: true })
  runId: string | null;

  @ApiProperty({ enum: RunStatus })
  status: RunStatus;

  @ApiProperty({ type: [RecommendedActionResponseDto] })
  actions: RecommendedActionResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  completedAt: string | null;

  static Map(
    pipelineId: string,
    run: RecommendationRun | null,
  ): RecommendationsResponseDto {
    if (!run || run.status !== RunStatus.COMPLETED) {
      return {
        pipelineId,
        runId: run?.id ?? null,
        status: run?.status ?? RunStatus.PENDING,
        actions: [],
        completedAt: null,
      };
    }

    return {
      pipelineId,
      runId: run.id,
      status: RunStatus.COMPLETED,
      actions: run.actions.getItems().map((action) => ({
        id: action.id,
        category: action.category,
        headline: action.headline,
        description: action.description,
        actionPlan: action.actionPlan,
        priority: action.priority,
        facet: action.facet ?? 'overall',
        supportingEvidence: action.supportingEvidence as SupportingEvidence,
        createdAt: action.createdAt.toISOString(),
      })),
      completedAt: run.completedAt?.toISOString() ?? null,
    };
  }
}
