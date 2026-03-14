import { Entity, Enum, Index, ManyToOne, Property } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { RecommendedActionRepository } from '../repositories/recommended-action.repository';
import { ActionPriority } from '../modules/analysis/enums';
import { RecommendationRun } from './recommendation-run.entity';

@Entity({ repository: () => RecommendedActionRepository })
@Index({ properties: ['run'] })
export class RecommendedAction extends CustomBaseEntity {
  @ManyToOne(() => RecommendationRun)
  run!: RecommendationRun;

  @Property()
  category!: string;

  @Property({ type: 'text' })
  actionText!: string;

  @Enum(() => ActionPriority)
  priority!: ActionPriority;

  @Property({ type: 'jsonb' })
  supportingEvidence!: Record<string, unknown>;
}
