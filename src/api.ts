import { Hono, MiddlewareHandler } from "hono";
import { hc } from "hono/client";
import { validator } from "hono/validator";
import { and, count, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { LoadDB, DB, setDB, db } from "@/db/db";
import { device, lap, race, runner, user, userRace } from "@/db/schema";
import { Context } from "hono";
import { errorHandler } from "./errors";
import { requireAuthCookie, authUser } from "./security";
import { runnerRef } from "./runner";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE_HEADER = "x-device-id";
const RACE_HEADER = "x-race-id";

// Records which device last talked to the server, and for which race, so
// the summary view can show who's currently reporting. Piggybacks on every
// authenticated request instead of a dedicated heartbeat endpoint. Never
// blocks or fails the underlying request - tracing is best-effort.
const touchDevice: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const deviceId = c.req.header(DEVICE_HEADER);
  if (deviceId && UUID_RE.test(deviceId)) {
    const raceId = c.req.header(RACE_HEADER);
    const values = {
      id: deviceId,
      user: authUser(c).sub,
      lastSeen: new Date(),
      ...(raceId && UUID_RE.test(raceId) ? { race: raceId } : {}),
    };
    await db(c)
      .insert(device)
      .values(values)
      .onConflictDoUpdate({ target: device.id, set: values })
      .catch(() => {});
  }
  await next();
};

export type ApiEnv = {
  Bindings: CloudflareBindings;
  Variables: {
    db: DB;
  };
};

type Lap = typeof lap.$inferSelect;
export interface LapData extends Omit<Lap, "timestamp"> {
  timestamp: string;
}

export interface RaceData {
  id: string;
  name: string;
}

export type RunnerData = typeof runner.$inferSelect;

export interface ScanResult {
  runner: RunnerData;
  race: RaceData;
  lapCount: number;
}

export interface DeviceData {
  id: string;
  user: string;
  label: string | null;
  lastSeen: string;
}

export type ApiContext = Context<ApiEnv>;
export type ApiType = ReturnType<typeof createAPI>;
export type ApiClient = ReturnType<typeof hc<ApiType>>;

// Hono only infers a route's RPC input type for the request body from a
// validator middleware, not from a bare `c.req.json<T>()` call - this is a
// type-only pass-through (no runtime schema library) purely to get that
// inference for routes that also have a path param, whose presence
// otherwise makes the RPC input type too concrete to accept an unlisted
// `json` key.
const jsonBody = <T>() => validator("json", (value) => value as T);

export const createAPI = (loadDB: LoadDB) =>
  new Hono<ApiEnv>()
    .use(setDB(loadDB))
    .use(requireAuthCookie)
    .use(touchDevice)
    .onError(errorHandler)
    .get("/races/:id/laps", async (c) => {
      const id = c.req.param("id");
      const result = await db(c)
        .select({
          id: lap.id,
          runner: lap.runner,
          timestamp: lap.timestamp,
        })
        .from(lap)
        .where(eq(lap.race, id));
      return c.json(result);
    })
    .get("/races/:id/devices", async (c) => {
      const id = c.req.param("id");
      const rows = await db(c)
        .select({
          id: device.id,
          user: user.name,
          label: device.label,
          lastSeen: device.lastSeen,
        })
        .from(device)
        .innerJoin(user, eq(user.sub, device.user))
        .where(eq(device.race, id))
        .orderBy(desc(device.lastSeen));
      return c.json<DeviceData[]>(
        rows.map((row) => ({
          ...row,
          lastSeen: row.lastSeen.toISOString(),
        })),
      );
    })
    .get("/races", async (c) => {
      const rows = await db(c)
        .select({ id: race.id, name: race.name })
        .from(userRace)
        .innerJoin(race, eq(race.id, userRace.race))
        .where(eq(userRace.user, authUser(c).sub));
      return c.json<RaceData[]>(rows);
    })
    .post(
      "/races",
      jsonBody<{ name: string; id?: string; updateDefault?: boolean }>(),
      async (c) => {
        const { name, id: clientId, updateDefault } = c.req.valid("json");
        if (!name?.trim())
          throw new HTTPException(400, { message: "name is required" });

        // A client generates its own id so it can create races while
        // offline; onConflictDoNothing makes resending the same create
        // (e.g. a synced retry) a no-op instead of an error.
        const id = clientId ?? crypto.randomUUID();
        await db(c).insert(race).values({ id, name }).onConflictDoNothing();
        await db(c)
          .insert(userRace)
          .values({ user: authUser(c).sub, race: id })
          .onConflictDoNothing();
        // updateDefault is false for a race switch made mid-session on an
        // already-loaded device: selectedRace is the bootstrap default
        // other devices/sessions pick up on a fresh start, and it would be
        // surprising for it to change out from under them because of an
        // action on a device that's already running.
        if (updateDefault ?? true) {
          await db(c)
            .update(user)
            .set({ selectedRace: id })
            .where(eq(user.sub, authUser(c).sub));
        }

        return c.json<RaceData>({ id, name });
      },
    )
    .get("/races/selected", async (c) => {
      const [row] = await db(c)
        .select({ id: race.id, name: race.name })
        .from(user)
        .innerJoin(race, eq(race.id, user.selectedRace))
        .where(eq(user.sub, authUser(c).sub));

      return c.json<RaceData | null>(row ?? null);
    })
    .get("/races/:id", async (c) => {
      const id = c.req.param("id");
      const [found] = await db(c)
        .select({ id: race.id, name: race.name })
        .from(race)
        .where(eq(race.id, id));
      if (!found) throw new HTTPException(404, { message: "Race not found" });

      return c.json<RaceData>(found);
    })
    .post(
      "/races/:id/join",
      jsonBody<{ updateDefault?: boolean }>(),
      async (c) => {
        const id = c.req.param("id");
        const { updateDefault } = c.req.valid("json");
        const [found] = await db(c)
          .select({ id: race.id, name: race.name })
          .from(race)
          .where(eq(race.id, id));
        if (!found)
          throw new HTTPException(404, { message: "Race not found" });

        await db(c)
          .insert(userRace)
          .values({ user: authUser(c).sub, race: id })
          .onConflictDoNothing();
        if (updateDefault ?? true) {
          await db(c)
            .update(user)
            .set({ selectedRace: id })
            .where(eq(user.sub, authUser(c).sub));
        }

        return c.json<RaceData>(found);
      },
    )
    .post(
      "/runners/scan",
      jsonBody<{ data: string; race: string; timestamp: string }>(),
      async (c) => {
        const { data, race: raceId, timestamp } = c.req.valid("json");
        if (!data?.trim())
          throw new HTTPException(400, { message: "data is required" });
        if (!raceId)
          throw new HTTPException(400, { message: "race is required" });
        const scannedAt = new Date(timestamp);
        if (isNaN(scannedAt.getTime()))
          throw new HTTPException(400, { message: "timestamp is invalid" });

        // The race is named explicitly by the client (rather than resolved
        // from the user's server-side selected race) so a scan queued
        // while offline still lands against the race it was actually
        // scanned for, even if the device has since switched races
        // locally.
        const [selected] = await db(c)
          .select({ id: race.id, name: race.name })
          .from(userRace)
          .innerJoin(race, eq(race.id, userRace.race))
          .where(
            and(
              eq(userRace.user, authUser(c).sub),
              eq(userRace.race, raceId),
            ),
          );
        if (!selected)
          throw new HTTPException(400, { message: "Race not joined" });

        const ref = await runnerRef(data);
        await db(c)
          .insert(runner)
          .values({ ref, info: data })
          .onConflictDoNothing();
        // onConflictDoNothing makes resending the same scan (a synced
        // retry after the device never saw the response) a no-op instead
        // of double-counting the lap.
        await db(c)
          .insert(lap)
          .values({ runner: ref, race: selected.id, timestamp: scannedAt })
          .onConflictDoNothing({
            target: [lap.runner, lap.race, lap.timestamp],
          });

        const [runnerRow] = await db(c)
          .select()
          .from(runner)
          .where(eq(runner.ref, ref));
        const [{ lapCount }] = await db(c)
          .select({ lapCount: count() })
          .from(lap)
          .where(and(eq(lap.runner, ref), eq(lap.race, selected.id)));

        return c.json<ScanResult>({
          runner: runnerRow!,
          race: selected,
          lapCount,
        });
      },
    );
