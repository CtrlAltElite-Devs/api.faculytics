import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  Property,
} from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { TopicRepository } from '../repositories/topic.repository';
import { TopicModelRun } from './topic-model-run.entity';
import { TopicAssignment } from './topic-assignment.entity';

@Entity({ repository: () => TopicRepository })
@Index({ properties: ['run'] })
export class Topic extends CustomBaseEntity {
  @ManyToOne(() => TopicModelRun)
  run!: TopicModelRun;

  @Property()
  topicIndex!: number;

  @Property()
  rawLabel!: string;

  @Property({ nullable: true })
  label?: string;

  @Property({ type: 'array' })
  keywords!: string[];

  @Property()
  docCount!: number;

  @OneToMany(() => TopicAssignment, (a) => a.topic)
  assignments = new Collection<TopicAssignment>(this);
}
