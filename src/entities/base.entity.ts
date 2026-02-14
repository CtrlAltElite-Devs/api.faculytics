import { Opt, PrimaryKey, Property } from '@mikro-orm/core';
import { v4 } from 'uuid';

export abstract class CustomBaseEntity {
  @PrimaryKey()
  id: string & Opt = v4();

  @Property()
  createdAt: Date & Opt = new Date();

  @Property()
  updatedAt: Date & Opt = new Date();

  @Property({ nullable: true })
  deletedAt?: Date & Opt;

  SoftDelete() {
    this.deletedAt = new Date();
  }
}
