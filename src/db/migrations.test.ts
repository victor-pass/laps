import { describe, expect, it } from "vitest";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { uuid } from "@/test/fixtures";

const MIGRATIONS = "./drizzle";

// A database migrated up to (not including) `migration`, and a way to apply
// the rest - for checking a migration against data that already exists.
async function migratedUpTo(migration: string) {
  const all = (await readdir(MIGRATIONS)).sort();
  const before = all.slice(0, all.indexOf(migration));
  const partial = await mkdtemp(path.join(tmpdir(), "laps-migrations-"));
  for (const dir of before)
    await cp(path.join(MIGRATIONS, dir), path.join(partial, dir), {
      recursive: true,
    });

  const client = new PGlite();
  const db = drizzle({ client });
  await migrate(db, { migrationsFolder: partial });
  await rm(partial, { recursive: true });
  return {
    client,
    applyRest: () => migrate(db, { migrationsFolder: MIGRATIONS }),
  };
}

describe("lap device foreign key migration", () => {
  it("clears laps' devices that have no device row, instead of failing", async () => {
    const { client, applyRest } = await migratedUpTo(
      "20261009155330_glamorous_lightspeed",
    );
    await client.exec(`
      INSERT INTO "user" (sub, name) VALUES ('user', 'user');
      INSERT INTO race (id, name) VALUES ('${uuid(0)}', 'Spring 5k');
      INSERT INTO runner (ref) VALUES ('${uuid(1)}');
      INSERT INTO device (id, user_sub, last_seen) VALUES ('${uuid(5)}', 'user', now());
      INSERT INTO lap (runner_ref, race_id, timestamp, device_id) VALUES
        ('${uuid(1)}', '${uuid(0)}', '2026-01-01T10:00:00Z', '${uuid(5)}'),
        ('${uuid(1)}', '${uuid(0)}', '2026-01-01T10:10:00Z', '${uuid(6)}'),
        ('${uuid(1)}', '${uuid(0)}', '2026-01-01T10:20:00Z', NULL);
    `);

    await applyRest();

    const { rows } = await client.query(
      `SELECT device_id FROM lap ORDER BY timestamp`,
    );
    expect(rows).toEqual([
      { device_id: uuid(5) }, // known device - kept
      { device_id: null }, // no device row - cleared
      { device_id: null },
    ]);
    await expect(
      client.query(
        `INSERT INTO lap (runner_ref, race_id, timestamp, device_id)
         VALUES ('${uuid(1)}', '${uuid(0)}', '2026-01-01T11:00:00Z', '${uuid(7)}')`,
      ),
    ).rejects.toThrow(/foreign key/);
  });
});

describe("lap user migration", () => {
  it("backfills existing laps with their device's user", async () => {
    const { client, applyRest } = await migratedUpTo(
      "20261009160255_bitter_tarot",
    );
    await client.exec(`
      INSERT INTO "user" (sub, name) VALUES ('jo', 'Jo');
      INSERT INTO race (id, name) VALUES ('${uuid(0)}', 'Spring 5k');
      INSERT INTO runner (ref) VALUES ('${uuid(1)}');
      INSERT INTO device (id, user_sub, last_seen) VALUES ('${uuid(5)}', 'jo', now());
      INSERT INTO lap (runner_ref, race_id, timestamp, device_id) VALUES
        ('${uuid(1)}', '${uuid(0)}', '2026-01-01T10:00:00Z', '${uuid(5)}'),
        ('${uuid(1)}', '${uuid(0)}', '2026-01-01T10:10:00Z', NULL);
    `);

    await applyRest();

    const { rows } = await client.query(
      `SELECT user_sub FROM lap ORDER BY timestamp`,
    );
    expect(rows).toEqual([
      { user_sub: "jo" }, // from its device
      { user_sub: null }, // no device to go on
    ]);
  });
});
