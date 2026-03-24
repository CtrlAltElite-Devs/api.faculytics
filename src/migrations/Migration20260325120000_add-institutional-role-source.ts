import { Migration } from '@mikro-orm/migrations';

export class Migration20260325120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "user_institutional_role" add column "source" varchar(255) not null default 'auto';`,
    );

    // Preserve existing roles by marking them as manually assigned
    this.addSql(
      `update "user_institutional_role" set "source" = 'manual';`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "user_institutional_role" drop column "source";`,
    );
  }
}
