import { Migration } from '@mikro-orm/migrations';

export class Migration20260412161915 extends Migration {

  override async up(): Promise<void> {
    // Drop orphaned test table
    this.addSql(`drop table if exists "playing_with_neon" cascade;`);

    // Update enum check constraints with new values
    this.addSql(`alter table "questionnaire_version" drop constraint if exists "questionnaire_version_status_check";`);
    this.addSql(`alter table "questionnaire_submission" drop constraint if exists "questionnaire_submission_respondent_role_check";`);

    // Fix audit_log.occurred_at to have proper default
    this.addSql(`alter table "audit_log" alter column "occurred_at" drop default;`);
    this.addSql(`alter table "audit_log" alter column "occurred_at" type timestamptz using ("occurred_at"::timestamptz);`);
    this.addSql(`alter table "audit_log" alter column "occurred_at" set default now();`);

    // Re-add check constraints with updated enum values
    this.addSql(`alter table "questionnaire_version" add constraint "questionnaire_version_status_check" check("status" in ('DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED'));`);
    this.addSql(`alter table "questionnaire_submission" add constraint "questionnaire_submission_respondent_role_check" check("respondent_role" in ('STUDENT', 'DEAN', 'CHAIRPERSON'));`);

    // Fix submission_embedding.embedding type (remove dimension constraint)
    this.addSql(`alter table "submission_embedding" alter column "embedding" type vector using ("embedding"::vector);`);

    // Convert recommended_action.category from native enum to text with check constraint
    this.addSql(`alter table "recommended_action" alter column "category" type text using ("category"::text);`);
    this.addSql(`alter table "recommended_action" alter column "description" drop default;`);
    this.addSql(`alter table "recommended_action" alter column "description" type text using ("description"::text);`);
    this.addSql(`alter table "recommended_action" alter column "action_plan" drop default;`);
    this.addSql(`alter table "recommended_action" alter column "action_plan" type text using ("action_plan"::text);`);
    this.addSql(`alter table "recommended_action" add constraint "recommended_action_category_check" check("category" in ('STRENGTH', 'IMPROVEMENT'));`);

    // Drop the now-unused native enum type
    this.addSql(`drop type "action_category";`);
  }

  override async down(): Promise<void> {
    // Recreate native enum and test table
    this.addSql(`create type "action_category" as enum ('STRENGTH', 'IMPROVEMENT');`);
    this.addSql(`create table "playing_with_neon" ("id" serial primary key, "name" text not null, "value" float4 null);`);

    // Drop updated check constraints
    this.addSql(`alter table "questionnaire_submission" drop constraint if exists "questionnaire_submission_respondent_role_check";`);
    this.addSql(`alter table "questionnaire_version" drop constraint if exists "questionnaire_version_status_check";`);
    this.addSql(`alter table "recommended_action" drop constraint if exists "recommended_action_category_check";`);

    // Restore audit_log.occurred_at with precision
    this.addSql(`alter table "audit_log" alter column "occurred_at" type timestamptz(6) using ("occurred_at"::timestamptz(6));`);
    this.addSql(`alter table "audit_log" alter column "occurred_at" set default now();`);

    // Restore check constraints with old enum values
    this.addSql(`alter table "questionnaire_submission" add constraint "questionnaire_submission_respondent_role_check" check("respondent_role" in ('STUDENT', 'DEAN'));`);
    this.addSql(`alter table "questionnaire_version" add constraint "questionnaire_version_status_check" check("status" in ('DRAFT', 'ACTIVE', 'DEPRECATED'));`);

    // Restore recommended_action to native enum
    this.addSql(`alter table "recommended_action" alter column "category" type "action_category" using ("category"::"action_category");`);
    this.addSql(`alter table "recommended_action" alter column "description" type text using ("description"::text);`);
    this.addSql(`alter table "recommended_action" alter column "description" set default '';`);
    this.addSql(`alter table "recommended_action" alter column "action_plan" type text using ("action_plan"::text);`);
    this.addSql(`alter table "recommended_action" alter column "action_plan" set default '';`);

    // Restore submission_embedding.embedding with dimension
    this.addSql(`alter table "submission_embedding" alter column "embedding" type vector(768) using ("embedding"::vector(768));`);
  }

}
