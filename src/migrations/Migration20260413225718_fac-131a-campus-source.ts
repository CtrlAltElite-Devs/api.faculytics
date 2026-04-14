import { Migration } from '@mikro-orm/migrations';

export class Migration20260413225718_fac131aCampusSource extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "user" add column "campus_source" varchar(255) not null default 'auto';`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" drop column "campus_source";`);
  }
}
