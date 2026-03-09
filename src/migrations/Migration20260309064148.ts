import { Migration } from '@mikro-orm/migrations';

export class Migration20260309064148 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "course" add column "course_image" varchar(255) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "course" drop column "course_image";`);
  }

}
