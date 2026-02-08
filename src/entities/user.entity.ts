import { Entity, Property } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';

@Entity()
export class User extends CustomBaseEntity {
  @Property({ nullable: true })
  fullName?: string;
}
