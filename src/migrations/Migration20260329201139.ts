import { Migration } from '@mikro-orm/migrations';

export class Migration20260329201139 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "audit_log" ("id" varchar(255) not null, "action" varchar(255) not null, "actor_id" varchar(255) null, "actor_username" varchar(255) null, "resource_type" varchar(255) null, "resource_id" varchar(255) null, "metadata" jsonb null, "browser_name" varchar(255) null, "os" varchar(255) null, "ip_address" varchar(255) null, "occurred_at" timestamptz not null, constraint "audit_log_pkey" primary key ("id"));`);
    this.addSql(`alter table "audit_log" alter column "occurred_at" set default now();`);
    this.addSql(`create index "audit_log_action_index" on "audit_log" ("action");`);
    this.addSql(`create index "audit_log_actor_id_index" on "audit_log" ("actor_id");`);
    this.addSql(`create index "audit_log_occurred_at_index" on "audit_log" ("occurred_at");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "audit_log" cascade;`);
  }

}
