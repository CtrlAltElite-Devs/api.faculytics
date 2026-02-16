import { Migration } from '@mikro-orm/migrations';

export class Migration20260216042641 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "user" add column "roles" text[] not null default '{}';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" drop column "roles";`);
  }

}
