import type { DB } from "@/db/db";
import { dbSeed } from "@/test/inMemoryDB";
import {
  DEMO_RACE_ID,
  DEMO_RACE_NAME,
  DEMO_RACER_ID,
  DEMO_RACER_NAME,
  DEMO_USER_ID,
  DEMO_USER_NAME,
  SECOND_RACER_ID,
  SECOND_RACER_NAME,
} from "./constants";

export {
  DEMO_RACE_ID,
  DEMO_RACE_NAME,
  DEMO_RACER_ID,
  DEMO_RACER_NAME,
  DEMO_USER_ID,
  DEMO_USER_NAME,
  SECOND_RACER_ID,
  SECOND_RACER_NAME,
} from "./constants";

const baseRacers = [
  {
    ref: DEMO_RACER_ID,
    info: null,
    name: DEMO_RACER_NAME,
    details: {},
  },
  {
    ref: SECOND_RACER_ID,
    info: null,
    name: SECOND_RACER_NAME,
    details: {},
  },
];

export async function seedDemoUser(db: DB): Promise<void> {
  await dbSeed(db)({
    user: [{ sub: DEMO_USER_ID, name: DEMO_USER_NAME }],
  });
}

export async function seedRaceRacers(
  db: DB,
  raceId: string,
  options: { includeLaps?: boolean } = {},
): Promise<void> {
  await dbSeed(db)({
    runner: baseRacers,
    raceRunner: baseRacers.map(({ ref }) => ({ race: raceId, runner: ref })),
    ...(options.includeLaps
      ? {
          lap: [
            {
              runner: DEMO_RACER_ID,
              race: raceId,
              timestamp: new Date("2026-11-13T16:10:00.000Z"),
            },
            {
              runner: DEMO_RACER_ID,
              race: raceId,
              timestamp: new Date("2026-11-13T16:18:00.000Z"),
            },
            {
              runner: SECOND_RACER_ID,
              race: raceId,
              timestamp: new Date("2026-11-13T16:12:00.000Z"),
            },
          ],
        }
      : {}),
  });
}

export async function seedStandaloneRace(
  db: DB,
  options: { includeLaps?: boolean } = {},
): Promise<void> {
  await dbSeed(db)({
    race: [{ id: DEMO_RACE_ID, name: DEMO_RACE_NAME }],
    runner: baseRacers,
    user: [
      {
        sub: DEMO_USER_ID,
        name: DEMO_USER_NAME,
        selectedRace: DEMO_RACE_ID,
      },
    ],
    userRace: [{ user: DEMO_USER_ID, race: DEMO_RACE_ID }],
    raceRunner: baseRacers.map(({ ref }) => ({
      race: DEMO_RACE_ID,
      runner: ref,
    })),
    ...(options.includeLaps
      ? {
          lap: [
            {
              runner: DEMO_RACER_ID,
              race: DEMO_RACE_ID,
              timestamp: new Date("2026-11-13T16:10:00.000Z"),
            },
            {
              runner: DEMO_RACER_ID,
              race: DEMO_RACE_ID,
              timestamp: new Date("2026-11-13T16:18:00.000Z"),
            },
            {
              runner: SECOND_RACER_ID,
              race: DEMO_RACE_ID,
              timestamp: new Date("2026-11-13T16:12:00.000Z"),
            },
          ],
        }
      : {}),
  });
}
