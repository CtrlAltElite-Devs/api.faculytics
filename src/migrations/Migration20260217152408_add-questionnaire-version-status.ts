import { Migration } from '@mikro-orm/migrations';

export class Migration20260217152408 extends Migration {

  override async up(): Promise<void> {
    // Drop old constraint first
    this.addSql(`alter table "questionnaire" drop constraint if exists "questionnaire_status_check";`);

    // Migrate existing data: PUBLISHED -> ACTIVE, ARCHIVED -> DEPRECATED
    this.addSql(`update "questionnaire" set "status" = 'ACTIVE' where "status" = 'PUBLISHED';`);
    this.addSql(`update "questionnaire" set "status" = 'DEPRECATED' where "status" = 'ARCHIVED';`);

    // Add new constraint with updated values
    this.addSql(`alter table "questionnaire" add constraint "questionnaire_status_check" check("status" in ('DRAFT', 'ACTIVE', 'DEPRECATED'));`);

    // Add status column to questionnaire_version
    this.addSql(`alter table "questionnaire_version" add column "status" text check ("status" in ('DRAFT', 'ACTIVE', 'DEPRECATED')) not null default 'DRAFT';`);

    // Set status based on existing isActive and publishedAt fields
    this.addSql(`update "questionnaire_version" set "status" = 'ACTIVE' where "is_active" = true;`);
    this.addSql(`update "questionnaire_version" set "status" = 'DEPRECATED' where "is_active" = false and "published_at" is not null;`);
  }

  override async down(): Promise<void> {
    // Drop new constraint
    this.addSql(`alter table "questionnaire" drop constraint if exists "questionnaire_status_check";`);

    // Revert data: ACTIVE -> PUBLISHED, DEPRECATED -> ARCHIVED
    this.addSql(`update "questionnaire" set "status" = 'PUBLISHED' where "status" = 'ACTIVE';`);
    this.addSql(`update "questionnaire" set "status" = 'ARCHIVED' where "status" = 'DEPRECATED';`);

    // Restore old constraint
    this.addSql(`alter table "questionnaire" add constraint "questionnaire_status_check" check("status" in ('DRAFT', 'PUBLISHED', 'ARCHIVED'));`);

    // Drop status column from questionnaire_version
    this.addSql(`alter table "questionnaire_version" drop column "status";`);
  }

}
