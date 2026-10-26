import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { type LoadDB, type DB } from "@/db/db";
import { PGlite } from "@electric-sql/pglite";
import { user, race, userRace, lap, runner, raceRunner } from "@/db/schema";

let snapshot: File | Blob | undefined = undefined;

export const inMemoryDB: LoadDB = async () => {
  if (snapshot) {
    const client = new PGlite({ loadDataDir: snapshot });
    return drizzle({ client }) as unknown as DB;
  }

  const client = new PGlite();
  const db = drizzle({ client });

  await migrate(db, {
    migrationsFolder: "./drizzle",
  });
  snapshot = await client.dumpDataDir("none");

  return db as unknown as DB;
};

type User = typeof user.$inferInsert;
type UserRace = typeof userRace.$inferInsert;
type Lap = typeof lap.$inferInsert;
type Race = typeof race.$inferInsert;
type Runner = typeof runner.$inferInsert;
type RaceRunner = typeof raceRunner.$inferInsert;

export const dbSeed = (db: DB) => {
  return async (values: {
    user?: User[];
    userRace?: UserRace[];
    race?: Race[];
    runner?: Runner[];
    raceRunner?: RaceRunner[];
    lap?: Lap[];
  }) => {
    await db.transaction(async (tx) => {
      if (values.race) await tx.insert(race).values(values.race);
      if (values.runner) await tx.insert(runner).values(values.runner);
      if (values.user) await tx.insert(user).values(values.user);
      if (values.userRace) await tx.insert(userRace).values(values.userRace);
      if (values.raceRunner)
        await tx.insert(raceRunner).values(values.raceRunner);
      if (values.lap) await tx.insert(lap).values(values.lap);
    });
  };
};
