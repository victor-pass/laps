import { Hono, MiddlewareHandler } from "hono";
import { hc } from "hono/client";
import { validator } from "hono/validator";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { LoadDB, DB, setDB, db } from "@/db/db";
import {
  device,
  lap,
  race,
  raceRunner,
  runner,
  user,
  userRace,
} from "@/db/schema";
import { Context } from "hono";
import { errorHandler } from "./errors";
import { requireAuthCookie, authUser } from "./security";
import { runnerRef } from "./runner";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE_HEADER = "x-device-id";
const RACE_HEADER = "x-race-id";

// The calling device's id, when it sent a well-formed one. Scans queued
// offline are replayed by the same device that recorded them, so this is
// always the device that actually scanned.
const requestDeviceId = (c: Context) => {
  const id = c.req.header(DEVICE_HEADER);
  return id && UUID_RE.test(id) ? id : null;
};

// Records which device last talked to the server, and for which race, so
// the summary view can show who's currently reporting. Piggybacks on every
// authenticated request instead of a dedicated heartbeat endpoint. Never
// blocks or fails the underlying request - tracing is best-effort.
const touchDevice: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const deviceId = requestDeviceId(c);
  if (deviceId) {
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
  // The runner's scanned info and assigned name, so lap lists can show a
  // name without a separate lookup per runner.
  info: unknown;
  name: string | null;
  // The scanning device's label, if it was given one.
  deviceLabel: string | null;
  // The name of the user signed in when the lap reached the server.
  userName: string | null;
}

export interface RaceData {
  id: string;
  name: string;
  lapFilterSeconds: number;
}

export type RunnerData = typeof runner.$inferSelect;

// A runner on a race's racers page, with how many laps they've recorded in
// it (unfiltered) - only a racer with none can be removed.
export interface RacerData extends RunnerData {
  laps: number;
}

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

async function requireJoined(c: ApiContext, raceId: string) {
  const [joined] = UUID_RE.test(raceId)
    ? await db(c)
        .select({ race: userRace.race })
        .from(userRace)
        .where(
          and(eq(userRace.user, authUser(c).sub), eq(userRace.race, raceId)),
        )
    : [];
  if (!joined) throw new HTTPException(400, { message: "Race not joined" });
}

// The race's racers, or just the given ones, with their lap counts in it.
async function racers(
  c: ApiContext,
  raceId: string,
  refs?: string[],
): Promise<RacerData[]> {
  return await db(c)
    .select({
      ref: runner.ref,
      info: runner.info,
      name: runner.name,
      laps: count(lap.id),
    })
    .from(raceRunner)
    .innerJoin(runner, eq(runner.ref, raceRunner.runner))
    .leftJoin(
      lap,
      and(eq(lap.runner, raceRunner.runner), eq(lap.race, raceRunner.race)),
    )
    .where(
      and(
        eq(raceRunner.race, raceId),
        refs ? inArray(raceRunner.runner, refs) : undefined,
      ),
    )
    .groupBy(runner.ref);
}

// A racer of the race, or a 404.
async function requireRacer(c: ApiContext, raceId: string, ref: string) {
  const [found] = UUID_RE.test(ref) ? await racers(c, raceId, [ref]) : [];
  if (!found) throw new HTTPException(404, { message: "Racer not found" });
  return found;
}

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
          info: runner.info,
          name: runner.name,
          device: lap.device,
          deviceLabel: device.label,
          user: lap.user,
          userName: user.name,
        })
        .from(lap)
        .innerJoin(runner, eq(runner.ref, lap.runner))
        .leftJoin(device, eq(device.id, lap.device))
        .leftJoin(user, eq(user.sub, lap.user))
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
        .select({
          id: race.id,
          name: race.name,
          lapFilterSeconds: race.lapFilterSeconds,
        })
        .from(userRace)
        .innerJoin(race, eq(race.id, userRace.race))
        .where(eq(userRace.user, authUser(c).sub));
      return c.json<RaceData[]>(rows);
    })
    .post("/races", jsonBody<{ name: string; id?: string }>(), async (c) => {
      const { name, id: clientId } = c.req.valid("json");
      if (!name?.trim())
        throw new HTTPException(400, { message: "name is required" });

      // A client generates its own id so it can create races while
      // offline; onConflictDoNothing makes resending the same create
      // (e.g. a synced retry) a no-op instead of an error. Creating
      // grants membership but never touches the user's selected race -
      // that's a distinct, coalesced choice made through
      // PUT /races/selected.
      const id = clientId ?? crypto.randomUUID();
      await db(c).insert(race).values({ id, name }).onConflictDoNothing();
      await db(c)
        .insert(userRace)
        .values({ user: authUser(c).sub, race: id })
        .onConflictDoNothing();

      // Selected fresh rather than returned from the insert, since
      // onConflictDoNothing means a resent create has no `.returning()`
      // row of its own - this always reflects the race's current state.
      const [created] = await db(c)
        .select({
          id: race.id,
          name: race.name,
          lapFilterSeconds: race.lapFilterSeconds,
        })
        .from(race)
        .where(eq(race.id, id));

      return c.json<RaceData>(created!);
    })
    .get("/races/selected", async (c) => {
      const [row] = await db(c)
        .select({
          id: race.id,
          name: race.name,
          lapFilterSeconds: race.lapFilterSeconds,
        })
        .from(user)
        .innerJoin(race, eq(race.id, user.selectedRace))
        .where(eq(user.sub, authUser(c).sub));

      return c.json<RaceData | null>(row ?? null);
    })
    .put("/races/selected", jsonBody<{ id: string }>(), async (c) => {
      const { id } = c.req.valid("json");
      const [found] = await db(c)
        .select({
          id: race.id,
          name: race.name,
          lapFilterSeconds: race.lapFilterSeconds,
        })
        .from(userRace)
        .innerJoin(race, eq(race.id, userRace.race))
        .where(and(eq(userRace.user, authUser(c).sub), eq(userRace.race, id)));
      if (!found) throw new HTTPException(400, { message: "Race not joined" });

      await db(c)
        .update(user)
        .set({ selectedRace: id })
        .where(eq(user.sub, authUser(c).sub));

      return c.json<RaceData>(found);
    })
    .get("/races/:id", async (c) => {
      const id = c.req.param("id");
      const [found] = await db(c)
        .select({
          id: race.id,
          name: race.name,
          lapFilterSeconds: race.lapFilterSeconds,
        })
        .from(race)
        .where(eq(race.id, id));
      if (!found) throw new HTTPException(404, { message: "Race not found" });

      return c.json<RaceData>(found);
    })
    .patch(
      "/races/:id",
      jsonBody<{ lapFilterSeconds: number }>(),
      async (c) => {
        const id = c.req.param("id");
        const { lapFilterSeconds } = c.req.valid("json");
        if (!Number.isInteger(lapFilterSeconds) || lapFilterSeconds < 0)
          throw new HTTPException(400, {
            message: "lapFilterSeconds must be a non-negative integer",
          });

        const [updated] = await db(c)
          .update(race)
          .set({ lapFilterSeconds })
          .where(eq(race.id, id))
          .returning({
            id: race.id,
            name: race.name,
            lapFilterSeconds: race.lapFilterSeconds,
          });
        if (!updated)
          throw new HTTPException(404, { message: "Race not found" });

        return c.json<RaceData>(updated);
      },
    )
    .post("/races/:id/join", async (c) => {
      const id = c.req.param("id");
      const [found] = await db(c)
        .select({
          id: race.id,
          name: race.name,
          lapFilterSeconds: race.lapFilterSeconds,
        })
        .from(race)
        .where(eq(race.id, id));
      if (!found) throw new HTTPException(404, { message: "Race not found" });

      // Grants membership only - never touches the user's selected race
      // (see PUT /races/selected).
      await db(c)
        .insert(userRace)
        .values({ user: authUser(c).sub, race: id })
        .onConflictDoNothing();

      return c.json<RaceData>(found);
    })
    .get("/races/:id/runners", async (c) => {
      const id = c.req.param("id");
      await requireJoined(c, id);
      return c.json<RacerData[]>(await racers(c, id));
    })
    // Adds a racer per name. Their id is all their QR code holds, so the
    // name stays in the app.
    .post(
      "/races/:id/runners",
      jsonBody<{ names: string[] }>(),
      async (c) => {
        const id = c.req.param("id");
        await requireJoined(c, id);
        const { names } = c.req.valid("json");
        const added = (Array.isArray(names) ? names : [])
          .map((name) => (typeof name === "string" ? name.trim() : ""))
          .filter(Boolean)
          .map((name) => ({ ref: crypto.randomUUID(), name }));
        if (!added.length)
          throw new HTTPException(400, { message: "names are required" });

        // No transaction (neon-http has none) - if the second insert fails
        // the new runners are just unlisted, and the client can retry.
        await db(c).insert(runner).values(added);
        await db(c)
          .insert(raceRunner)
          .values(added.map(({ ref }) => ({ race: id, runner: ref })));
        return c.json<RacerData[]>(
          added.map((r) => ({ ...r, info: null, laps: 0 })),
        );
      },
    )
    .patch(
      "/races/:id/runners/:ref",
      jsonBody<{ name: string | null }>(),
      async (c) => {
        const { id, ref } = c.req.param();
        await requireJoined(c, id);
        const found = await requireRacer(c, id, ref);
        const { name: raw } = c.req.valid("json");
        const name = typeof raw === "string" && raw.trim() ? raw.trim() : null;

        await db(c).update(runner).set({ name }).where(eq(runner.ref, ref));
        return c.json<RacerData>({ ...found, name });
      },
    )
    .delete("/races/:id/runners/:ref", async (c) => {
      const { id, ref } = c.req.param();
      await requireJoined(c, id);
      const found = await requireRacer(c, id, ref);
      if (found.laps > 0)
        throw new HTTPException(409, { message: "Racer has laps" });

      await db(c)
        .delete(raceRunner)
        .where(and(eq(raceRunner.race, id), eq(raceRunner.runner, ref)));
      return c.json({ ok: true });
    })
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
        const [selected] = await db(c)
          .select({
            id: race.id,
            name: race.name,
            lapFilterSeconds: race.lapFilterSeconds,
          })
          .from(userRace)
          .innerJoin(race, eq(race.id, userRace.race))
          .where(
            and(eq(userRace.user, authUser(c).sub), eq(userRace.race, raceId)),
          );
        if (!selected)
          throw new HTTPException(400, { message: "Race not joined" });

        const ref = await runnerRef(data);
        const deviceId = requestDeviceId(c);
        // touchDevice already tried, but only best-effort; the lap's device
        // must exist. If this fails, the request errors and the scan stays
        // queued on the device to retry - it's never dropped.
        if (deviceId)
          await db(c)
            .insert(device)
            .values({ id: deviceId, user: authUser(c).sub, lastSeen: new Date() })
            .onConflictDoNothing();
        await db(c)
          .insert(runner)
          .values({ ref, info: data })
          .onConflictDoNothing();
        await db(c)
          .insert(raceRunner)
          .values({ race: selected.id, runner: ref })
          .onConflictDoNothing();

        await db(c)
          .insert(lap)
          .values({
            runner: ref,
            race: selected.id,
            timestamp: scannedAt,
            device: deviceId,
            user: authUser(c).sub,
          })
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
