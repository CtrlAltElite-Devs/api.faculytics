import { Migration } from '@mikro-orm/migrations';

export class Migration20260216194934 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "user" add column "password" varchar(255) null;`);
    this.addSql(`alter table "user" alter column "moodle_user_id" type int using ("moodle_user_id"::int);`);
    this.addSql(`alter table "user" alter column "moodle_user_id" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" drop column "password";`);

    this.addSql(`alter table "user" alter column "moodle_user_id" type int using ("moodle_user_id"::int);`);
    this.addSql(`alter table "user" alter column "moodle_user_id" set not null;`);
  }

}
