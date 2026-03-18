import { Entity, Enum, Index, ManyToOne, Property } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { RecommendedActionRepository } from '../repositories/recommended-action.repository';
import { ActionPriority, ActionCategory } from '../modules/analysis/enums';
import { RecommendationRun } from './recommendation-run.entity';

@Entity({ repository: () => RecommendedActionRepository })
@Index({ properties: ['run'] })
export class RecommendedAction extends CustomBaseEntity {
  @ManyToOne(() => RecommendationRun)
  run!: RecommendationRun;

  @Enum(() => ActionCategory)
  category!: ActionCategory;

  @Property({ type: 'text' })
  headline!: string;

  @Property({ type: 'text' })
  description!: string;

  @Property({ type: 'text' })
  actionPlan!: string;

  @Enum(() => ActionPriority)
  priority!: ActionPriority;

  @Property({ type: 'jsonb' })
  supportingEvidence!: Record<string, unknown>;
}
