import { Migration } from '@mikro-orm/migrations';

export class Migration20260208175709 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "refresh_token" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "token_hash" varchar(255) not null, "user_id" varchar(255) not null, "expires_at" timestamptz not null, "revoked_at" timestamptz null, "replaced_by_token_id" varchar(255) null, "is_active" boolean not null, "browser_name" varchar(255) not null, "os" varchar(255) not null, "ip_address" varchar(255) not null, constraint "refresh_token_pkey" primary key ("id"));`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "refresh_token" cascade;`);
  }

}
