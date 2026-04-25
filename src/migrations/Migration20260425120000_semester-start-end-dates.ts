import { Migration } from '@mikro-orm/migrations';

export class Migration20260425120000 extends Migration {
  // Adds start_date/end_date to semester so analytics can order terms by
  // academic chronology instead of DB insertion order. Backfills existing rows
  // by parsing the `code` column (e.g. S22526 → Jan 20 – Jun 1 2026) using the
  // same calendar as admin.faculytics/src/lib/constants.ts getSemesterDates()
  // and the API-side parseSemesterCode() in moodle-category-sync.service.ts.
  //
  // Fallback: rows whose code doesn't match S{N}{YY1}{YY2} get start_date =
  // created_at so the NOT NULL constraint holds. end_date stays NULL for
  // unparseable rows — consumers treat it as "unknown."

  override async up(): Promise<void> {
    this.addSql(
      `alter table "semester" add column "start_date" timestamptz null;`,
    );
    this.addSql(
      `alter table "semester" add column "end_date" timestamptz null;`,
    );

    this.addSql(`
      update "semester"
      set
        "start_date" = case
          when "code" ~ '^S\\d{5}$' then
            case substring("code" from 2 for 1)
              when '1' then make_timestamptz(2000 + substring("code" from 3 for 2)::int,  8,  1, 0, 0, 0, 'UTC')
              when '2' then make_timestamptz(2000 + substring("code" from 5 for 2)::int,  1, 20, 0, 0, 0, 'UTC')
              when '3' then make_timestamptz(2000 + substring("code" from 5 for 2)::int,  6, 15, 0, 0, 0, 'UTC')
              else          make_timestamptz(2000 + substring("code" from 3 for 2)::int,  8,  1, 0, 0, 0, 'UTC')
            end
          else "created_at"
        end,
        "end_date" = case
          when "code" ~ '^S\\d{5}$' then
            case substring("code" from 2 for 1)
              when '1' then make_timestamptz(2000 + substring("code" from 3 for 2)::int, 12, 18, 0, 0, 0, 'UTC')
              when '2' then make_timestamptz(2000 + substring("code" from 5 for 2)::int,  6,  1, 0, 0, 0, 'UTC')
              when '3' then make_timestamptz(2000 + substring("code" from 5 for 2)::int,  7, 31, 0, 0, 0, 'UTC')
              else null
            end
          else null
        end;
    `);

    this.addSql(
      `alter table "semester" alter column "start_date" set not null;`,
    );
    this.addSql(
      `create index "semester_start_date_index" on "semester" ("start_date");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "semester_start_date_index";`);
    this.addSql(`alter table "semester" drop column "end_date";`);
    this.addSql(`alter table "semester" drop column "start_date";`);
  }
}
