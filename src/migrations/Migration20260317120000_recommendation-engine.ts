import { Migration } from '@mikro-orm/migrations';

export class Migration20260317120000 extends Migration {
  override async up(): Promise<void> {
    // 1. Create action_category enum type
    this.addSql(
      `CREATE TYPE "action_category" AS ENUM ('STRENGTH', 'IMPROVEMENT');`,
    );

    // 2. Convert category column from varchar to enum with safe cast
    this.addSql(
      `ALTER TABLE "recommended_action"
        ALTER COLUMN "category" TYPE action_category
        USING CASE
          WHEN "category" IN ('STRENGTH', 'IMPROVEMENT') THEN "category"::action_category
          ELSE 'IMPROVEMENT'::action_category
        END;`,
    );

    // 3. Rename action_text to headline
    this.addSql(
      `ALTER TABLE "recommended_action" RENAME COLUMN "action_text" TO "headline";`,
    );

    // 4. Add description column
    this.addSql(
      `ALTER TABLE "recommended_action" ADD COLUMN "description" text NOT NULL DEFAULT '';`,
    );

    // 5. Add action_plan column
    this.addSql(
      `ALTER TABLE "recommended_action" ADD COLUMN "action_plan" text NOT NULL DEFAULT '';`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `ALTER TABLE "recommended_action" DROP COLUMN "action_plan";`,
    );
    this.addSql(
      `ALTER TABLE "recommended_action" DROP COLUMN "description";`,
    );
    this.addSql(
      `ALTER TABLE "recommended_action" RENAME COLUMN "headline" TO "action_text";`,
    );
    this.addSql(
      `ALTER TABLE "recommended_action"
        ALTER COLUMN "category" TYPE varchar(255)
        USING "category"::text;`,
    );
    this.addSql(`DROP TYPE "action_category";`);
  }
}
