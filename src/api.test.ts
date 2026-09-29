import { createAPI } from "@/api";
import { dbSeed, inMemoryDB } from "@/test/inMemoryDB";
import { testClient } from "hono/testing";
import { expect, describe, it } from "vitest";
import { randomBytes } from "node:crypto";
import { sign } from "hono/jwt";
import { uuid } from "@/test/fixtures";

const JWT_SECRET = randomBytes(32).toString("hex");

const headers = async (sub: string, extra: Record<string, string> = {}) => ({
  headers: {
    Cookie: `auth_token=${await sign({ sub }, JWT_SECRET)}`,
    ...extra,
  },
});

async function setup() {
  const db = await inMemoryDB();
  const client = testClient(
    createAPI(async () => db),
    { JWT_SECRET },
  );
  const seed = dbSeed(db);

  return { db, client, seed };
}

describe("races/:id/laps", () => {
  it("returns laps for the given race", async () => {
    const { client, seed } = await setup();
    const jan1970 = new Date("1970-01-01T00:00:00Z");
    const jan2020 = new Date("2020-01-01T12:00:00Z");
    await seed({
      race: [
        { id: uuid(0), name: "focus race" },
        { id: uuid(1), name: "Other race" },
      ],
      user: [{ sub: "user", name: "user" }],
      runner: [{ ref: uuid(1), info: { name: "tom" } }],
      lap: [
        { timestamp: jan2020, runner: uuid(1), race: uuid(0) },
        { timestamp: jan1970, runner: uuid(1), race: uuid(1) },
      ],
    });
    const res = await client.races[":id"].laps.$get(
      { param: { id: uuid(0) } },
      await headers("user"),
    );

    expect(await res.json()).toEqual([
      {
        id: 1,
        runner: "00000000-0000-0000-0000-000000000001",
        timestamp: "2020-01-01T12:00:00.000Z",
      },
    ]);
  });
});

describe("races", () => {
  it("lists only races the user belongs to", async () => {
    const { client, seed } = await setup();
    await seed({
      user: [{ sub: "user", name: "user" }],
      race: [
        { id: uuid(1), name: "Spring 5k" },
        { id: uuid(2), name: "Other race" },
      ],
      userRace: [{ user: "user", race: uuid(1) }],
    });

    const res = await client.races.$get({}, await headers("user"));

    expect(await res.json()).toEqual([
      { id: uuid(1), name: "Spring 5k", lapFilterSeconds: 5 },
    ]);
  });

  it("creates a race and grants access, without selecting it", async () => {
    const { client, seed } = await setup();
    await seed({ user: [{ sub: "user", name: "user" }] });

    const createRes = await client.races.$post(
      { json: { name: "Spring 5k" } },
      await headers("user"),
    );
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    expect(created).toMatchObject({ name: "Spring 5k", lapFilterSeconds: 5 });

    const listRes = await client.races.$get({}, await headers("user"));
    expect(await listRes.json()).toEqual([created]);

    const selectedRes = await client.races.selected.$get(
      {},
      await headers("user"),
    );
    expect(await selectedRes.json()).toBeNull();
  });

  it("creates a race with a client-supplied id, and a resend is a no-op", async () => {
    const { client, seed } = await setup();
    await seed({ user: [{ sub: "user", name: "user" }] });

    const json = { id: uuid(5), name: "Spring 5k" };
    const first = await client.races.$post({ json }, await headers("user"));
    const second = await client.races.$post({ json }, await headers("user"));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      id: uuid(5),
      name: "Spring 5k",
      lapFilterSeconds: 5,
    });

    const res = await client.races.$get({}, await headers("user"));
    expect(await res.json()).toEqual([
      { id: uuid(5), name: "Spring 5k", lapFilterSeconds: 5 },
    ]);
  });

  it("creating a race does not change the user's selected race", async () => {
    const { client, seed } = await setup();
    await seed({
      user: [{ sub: "user", name: "user", selectedRace: uuid(1) }],
      race: [{ id: uuid(1), name: "Spring 5k" }],
      userRace: [{ user: "user", race: uuid(1) }],
    });

    await client.races.$post(
      { json: { name: "Trail Run" } },
      await headers("user"),
    );

    const selectedRes = await client.races.selected.$get(
      {},
      await headers("user"),
    );
    expect(await selectedRes.json()).toEqual({
      id: uuid(1),
      name: "Spring 5k",
      lapFilterSeconds: 5,
    });
  });

  it("rejects creating a race without a name", async () => {
    const { client, seed } = await setup();
    await seed({ user: [{ sub: "user", name: "user" }] });

    const res = await client.races.$post(
      { json: { name: "" } },
      await headers("user"),
    );
    expect(res.status).toBe(400);
  });

  it("previews a race by id without granting access or selecting it", async () => {
    const { client, seed } = await setup();
    await seed({
      user: [{ sub: "user", name: "user" }],
      race: [{ id: uuid(3), name: "Trail Run" }],
    });

    const res = await client.races[":id"].$get(
      { param: { id: uuid(3) } },
      await headers("user"),
    );
    expect(await res.json()).toEqual({
      id: uuid(3),
      name: "Trail Run",
      lapFilterSeconds: 5,
    });

    const selectedRes = await client.races.selected.$get(
      {},
      await headers("user"),
    );
    expect(await selectedRes.json()).toBeNull();
  });

  it("404s previewing an unknown race id", async () => {
    const { client, seed } = await setup();
    await seed({ user: [{ sub: "user", name: "user" }] });

    const res = await client.races[":id"].$get(
      { param: { id: uuid(9) } },
      await headers("user"),
    );
    expect(res.status).toBe(404);
  });

  it("joins an existing race and makes it the user's selected race", async () => {
    const { client, seed } = await setup();
    await seed({
      user: [{ sub: "user", name: "user" }],
      race: [{ id: uuid(3), name: "Trail Run" }],
    });

    const res = await client.races[":id"].join.$post(
      { param: { id: uuid(3) } },
      await headers("user"),
    );
    expect(await res.json()).toEqual({
      id: uuid(3),
      name: "Trail Run",
      lapFilterSeconds: 5,
    });
  });

  it("joining a race grants access but does not change the selected race", async () => {
    const { client, seed } = await setup();
    await seed({
      user: [{ sub: "user", name: "user", selectedRace: uuid(1) }],
      race: [
        { id: uuid(1), name: "Spring 5k" },
        { id: uuid(3), name: "Trail Run" },
      ],
      userRace: [{ user: "user", race: uuid(1) }],
    });

    await client.races[":id"].join.$post(
      { param: { id: uuid(3) } },
      await headers("user"),
    );

    const selectedRes = await client.races.selected.$get(
      {},
      await headers("user"),
    );
    expect(await selectedRes.json()).toEqual({
      id: uuid(1),
      name: "Spring 5k",
      lapFilterSeconds: 5,
    });

    const races = await client.races.$get({}, await headers("user"));
    expect(await races.json()).toEqual(
      expect.arrayContaining([
        { id: uuid(3), name: "Trail Run", lapFilterSeconds: 5 },
      ]),
    );
  });

  it("404s when joining an unknown race id", async () => {
    const { client, seed } = await setup();
    await seed({ user: [{ sub: "user", name: "user" }] });

    const res = await client.races[":id"].join.$post(
      { param: { id: uuid(9) } },
      await headers("user"),
    );
    expect(res.status).toBe(404);
  });
});

describe("races/selected (put)", () => {
  it("selects a race the user has joined", async () => {
    const { client, seed } = await setup();
    await seed({
      user: [{ sub: "user", name: "user" }],
      race: [{ id: uuid(1), name: "Spring 5k" }],
      userRace: [{ user: "user", race: uuid(1) }],
    });

    const res = await client.races.selected.$put(
      { json: { id: uuid(1) } },
      await headers("user"),
    );
    expect(await res.json()).toEqual({
      id: uuid(1),
      name: "Spring 5k",
      lapFilterSeconds: 5,
    });

    const selectedRes = await client.races.selected.$get(
      {},
      await headers("user"),
    );
    expect(await selectedRes.json()).toEqual({
      id: uuid(1),
      name: "Spring 5k",
      lapFilterSeconds: 5,
    });
  });

  it("400s selecting a race the user hasn't joined", async () => {
    const { client, seed } = await setup();
    await seed({
      user: [{ sub: "user", name: "user" }],
      race: [{ id: uuid(1), name: "Spring 5k" }],
    });

    const res = await client.races.selected.$put(
      { json: { id: uuid(1) } },
      await headers("user"),
    );
    expect(res.status).toBe(400);
  });
});

describe("races/:id (patch)", () => {
  it("updates the race's lap filter", async () => {
    const { client, seed } = await setup();
    await seed({
      user: [{ sub: "user", name: "user" }],
      race: [{ id: uuid(1), name: "Spring 5k" }],
    });

    const res = await client.races[":id"].$patch(
      { param: { id: uuid(1) }, json: { lapFilterSeconds: 8 } },
      await headers("user"),
    );
    expect(await res.json()).toEqual({
      id: uuid(1),
      name: "Spring 5k",
      lapFilterSeconds: 8,
    });

    const previewRes = await client.races[":id"].$get(
      { param: { id: uuid(1) } },
      await headers("user"),
    );
    expect(await previewRes.json()).toMatchObject({ lapFilterSeconds: 8 });
  });

  it("rejects a negative lap filter", async () => {
    const { client, seed } = await setup();
    await seed({
      user: [{ sub: "user", name: "user" }],
      race: [{ id: uuid(1), name: "Spring 5k" }],
    });

    const res = await client.races[":id"].$patch(
      { param: { id: uuid(1) }, json: { lapFilterSeconds: -1 } },
      await headers("user"),
    );
    expect(res.status).toBe(400);
  });

  it("404s updating an unknown race id", async () => {
    const { client, seed } = await setup();
    await seed({ user: [{ sub: "user", name: "user" }] });

    const res = await client.races[":id"].$patch(
      { param: { id: uuid(9) }, json: { lapFilterSeconds: 8 } },
      await headers("user"),
    );
    expect(res.status).toBe(404);
  });
});

describe("runners.scan", () => {
  it("creates a runner, records a lap, and returns the lap count", async () => {
    const { client, seed } = await setup();
    await seed({
      race: [{ id: uuid(0), name: "Spring 5k" }],
      user: [{ sub: "user", name: "user" }],
      userRace: [{ user: "user", race: uuid(0) }],
    });

    const res = await client.runners.scan.$post(
      {
        json: {
          data: "bib:42",
          race: uuid(0),
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      },
      await headers("user"),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.race).toEqual({
      id: uuid(0),
      name: "Spring 5k",
      lapFilterSeconds: 5,
    });
    expect(body.lapCount).toBe(1);
    expect(body.runner.info).toEqual("bib:42");
  });

  it("keeps the same runner and original info on repeat scans, incrementing the lap count", async () => {
    const { client, seed } = await setup();
    await seed({
      race: [{ id: uuid(0), name: "Spring 5k" }],
      user: [{ sub: "user", name: "user" }],
      userRace: [{ user: "user", race: uuid(0) }],
    });

    const first = await client.runners.scan.$post(
      {
        json: {
          data: "bib:42",
          race: uuid(0),
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      },
      await headers("user"),
    );
    const second = await client.runners.scan.$post(
      {
        json: {
          data: "bib:42",
          race: uuid(0),
          timestamp: "2026-01-01T00:01:00.000Z",
        },
      },
      await headers("user"),
    );

    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.runner.ref).toEqual(firstBody.runner.ref);
    expect(secondBody.runner.info).toEqual("bib:42");
    expect(secondBody.lapCount).toBe(2);
  });

  it("dedupes a resent scan with the same runner, race, and timestamp", async () => {
    const { client, seed } = await setup();
    await seed({
      race: [{ id: uuid(0), name: "Spring 5k" }],
      user: [{ sub: "user", name: "user" }],
      userRace: [{ user: "user", race: uuid(0) }],
    });
    const json = {
      data: "bib:42",
      race: uuid(0),
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    await client.runners.scan.$post({ json }, await headers("user"));
    const res = await client.runners.scan.$post(
      { json },
      await headers("user"),
    );

    expect((await res.json()).lapCount).toBe(1);
  });

  it("400s when the race hasn't been joined", async () => {
    const { client, seed } = await setup();
    await seed({
      race: [{ id: uuid(0), name: "Spring 5k" }],
      user: [{ sub: "user", name: "user" }],
    });

    const res = await client.runners.scan.$post(
      {
        json: {
          data: "bib:42",
          race: uuid(0),
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      },
      await headers("user"),
    );
    expect(res.status).toBe(400);
  });

  it("400s for empty data", async () => {
    const { client, seed } = await setup();
    await seed({
      race: [{ id: uuid(0), name: "Spring 5k" }],
      user: [{ sub: "user", name: "user" }],
      userRace: [{ user: "user", race: uuid(0) }],
    });

    const res = await client.runners.scan.$post(
      {
        json: {
          data: "",
          race: uuid(0),
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      },
      await headers("user"),
    );
    expect(res.status).toBe(400);
  });

  it("400s for an invalid timestamp", async () => {
    const { client, seed } = await setup();
    await seed({
      race: [{ id: uuid(0), name: "Spring 5k" }],
      user: [{ sub: "user", name: "user" }],
      userRace: [{ user: "user", race: uuid(0) }],
    });

    const res = await client.runners.scan.$post(
      { json: { data: "bib:42", race: uuid(0), timestamp: "not-a-date" } },
      await headers("user"),
    );
    expect(res.status).toBe(400);
  });
});

describe("races/:id/devices", () => {
  it("records the device from the request headers and lists it for its race", async () => {
    const { client, seed } = await setup();
    await seed({
      race: [{ id: uuid(0), name: "Spring 5k" }],
      user: [{ sub: "user", name: "Stephen" }],
      userRace: [{ user: "user", race: uuid(0) }],
    });
    const deviceId = uuid(5);

    await client.runners.scan.$post(
      {
        json: {
          data: "bib:42",
          race: uuid(0),
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      },
      await headers("user", {
        "X-Device-Id": deviceId,
        "X-Race-Id": uuid(0),
      }),
    );

    const res = await client.races[":id"].devices.$get(
      { param: { id: uuid(0) } },
      await headers("user"),
    );
    expect(await res.json()).toEqual([
      { id: deviceId, user: "Stephen", label: null, lastSeen: expect.any(String) },
    ]);
  });

  it("does not record a device when no device id header is sent", async () => {
    const { client, seed } = await setup();
    await seed({
      race: [{ id: uuid(0), name: "Spring 5k" }],
      user: [{ sub: "user", name: "user" }],
    });

    await client.races.$get({}, await headers("user"));

    const res = await client.races[":id"].devices.$get(
      { param: { id: uuid(0) } },
      await headers("user"),
    );
    expect(await res.json()).toEqual([]);
  });
});
