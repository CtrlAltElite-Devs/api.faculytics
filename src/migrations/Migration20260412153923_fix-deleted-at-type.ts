import { Migration } from '@mikro-orm/migrations';

export class Migration20260412153923 extends Migration {

  override async up(): Promise<void> {
    // Fix CustomBaseEntity.deletedAt reflection bug (issue #306)
    // TypeScript's emitDecoratorMetadata can't reflect optional Date types cleanly,
    // causing MikroORM to fall back to varchar(255). All tables extending CustomBaseEntity
    // (except report_job, which was created with timestamptz) have deleted_at as varchar(255).
    // This migration converts them to timestamptz to match the corrected entity metadata.

    const tables = [
      'analysis_pipeline',
      'campus',
      'course',
      'department',
      'dimension',
      'enrollment',
      'moodle_category',
      'moodle_token',
      'program',
      'questionnaire',
      'questionnaire_answer',
      'questionnaire_draft',
      'questionnaire_submission',
      'questionnaire_type',
      'questionnaire_version',
      'recommendation_run',
      'recommended_action',
      'refresh_token',
      'section',
      'semester',
      'sentiment_result',
      'sentiment_run',
      'submission_embedding',
      'system_config',
      'topic',
      'topic_assignment',
      'topic_model_run',
      'user',
      'user_institutional_role',
    ];

    for (const table of tables) {
      this.addSql(`alter table "${table}" alter column "deleted_at" type timestamptz using ("deleted_at"::timestamptz);`);
    }
  }

  override async down(): Promise<void> {
    const tables = [
      'analysis_pipeline',
      'campus',
      'course',
      'department',
      'dimension',
      'enrollment',
      'moodle_category',
      'moodle_token',
      'program',
      'questionnaire',
      'questionnaire_answer',
      'questionnaire_draft',
      'questionnaire_submission',
      'questionnaire_type',
      'questionnaire_version',
      'recommendation_run',
      'recommended_action',
      'refresh_token',
      'section',
      'semester',
      'sentiment_result',
      'sentiment_run',
      'submission_embedding',
      'system_config',
      'topic',
      'topic_assignment',
      'topic_model_run',
      'user',
      'user_institutional_role',
    ];

    for (const table of tables) {
      this.addSql(`alter table "${table}" alter column "deleted_at" type varchar(255) using ("deleted_at"::varchar(255));`);
    }
  }

}
