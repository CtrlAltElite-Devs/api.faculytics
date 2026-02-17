import { Entity, Property } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';

@Entity()
export class SystemConfig extends CustomBaseEntity {
  @Property({ unique: true })
  key!: string;

  @Property({ type: 'text' })
  value!: string;

  @Property({ nullable: true })
  description?: string;
}
