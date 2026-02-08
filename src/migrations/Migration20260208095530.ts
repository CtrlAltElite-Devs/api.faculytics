import { Migration } from '@mikro-orm/migrations';

export class Migration20260208095530 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "user" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "full_name" varchar(255) null, constraint "user_pkey" primary key ("id"));`);
  }

}
