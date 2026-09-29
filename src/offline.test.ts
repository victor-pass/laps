import { expect, describe, it, vi } from "vitest";
import { createOfflineEngine, emptyState } from "@/offline";
import type { ApiClient } from "@/api";
import { jsonResponse, mockJSONRequest, testRace, uuid } from "@/test/fixtures";

function fakeApi(overrides: {
  createRace?: ReturnType<typeof vi.fn>;
  join?: ReturnType<typeof vi.fn>;
  scan?: ReturnType<typeof vi.fn>;
  races?: ReturnType<typeof vi.fn>;
  selected?: ReturnType<typeof vi.fn>;
  select?: ReturnType<typeof vi.fn>;
  lapFilter?: ReturnType<typeof vi.fn>;
  laps?: ReturnType<typeof vi.fn>;
  preview?: ReturnType<typeof vi.fn>;
}): ApiClient {
  return {
    races: {
      $post: overrides.createRace ?? mockJSONRequest(null),
      $get: overrides.races ?? mockJSONRequest([]),
      selected: {
        $get: overrides.selected ?? mockJSONRequest(null),
        $put: overrides.select ?? mockJSONRequest(null),
      },
      ":id": {
        $get: overrides.preview ?? mockJSONRequest(null),
        $patch: overrides.lapFilter ?? mockJSONRequest(null),
        join: { $post: overrides.join ?? mockJSONRequest(null) },
        laps: { $get: overrides.laps ?? mockJSONRequest([]) },
        devices: { $get: mockJSONRequest([]) },
      },
    },
    runners: { scan: { $post: overrides.scan ?? mockJSONRequest(null) } },
  } as unknown as ApiClient;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("offline engine", () => {
  it("throws when scanning without a selected race", async () => {
    const engine = createOfflineEngine(emptyState());
    await expect(engine.scan(fakeApi({}), "bib:1")).rejects.toThrow(
      "No race selected",
    );
  });

  it("collapses rapid repeat scans of the same runner using the race's lap filter", async () => {
    const race = testRace(); // lapFilterSeconds: 5
    const engine = createOfflineEngine({ ...emptyState(), selectedRace: race });
    const api = fakeApi({});

    const first = await engine.scan(api, "bib:42");
    const second = await engine.scan(api, "bib:42");
    const other = await engine.scan(api, "bib:99");

    expect(first.lapCount).toBe(1);
    expect(second.lapCount).toBe(1); // within the race's filter window
    expect(other.lapCount).toBe(1);
  });

  it("counts every scan when the race's lap filter is zero", async () => {
    const race = testRace({ lapFilterSeconds: 0 });
    const engine = createOfflineEngine({ ...emptyState(), selectedRace: race });
    const api = fakeApi({});

    const first = await engine.scan(api, "bib:42");
    const second = await engine.scan(api, "bib:42");

    expect(first.lapCount).toBe(1);
    expect(second.lapCount).toBe(2);
  });

  it("sends a scan to the server with the race and a timestamp", async () => {
    const race = testRace();
    const engine = createOfflineEngine({ ...emptyState(), selectedRace: race });
    const scan = mockJSONRequest(null);

    await engine.scan(fakeApi({ scan }), "bib:42");
    await flush();

    expect(scan).toHaveBeenCalledExactlyOnceWith({
      json: { data: "bib:42", race: race.id, timestamp: expect.any(String) },
    });
  });

  it("queues join and create as plain membership events, without touching the selected race", async () => {
    const engine = createOfflineEngine(emptyState());
    const join = mockJSONRequest(null);
    const create = mockJSONRequest(null);
    const api = fakeApi({ join, createRace: create });

    engine.joinRace(api, testRace({ id: uuid(1) }));
    engine.createRace(api, "New race");
    await flush();

    expect(join).toHaveBeenCalledExactlyOnceWith({ param: { id: uuid(1) } });
    expect(create).toHaveBeenCalledExactlyOnceWith({
      json: { id: expect.any(String), name: "New race" },
    });
  });

  it("only lets the first race selection this session update the server default", async () => {
    const engine = createOfflineEngine(emptyState());
    const select = mockJSONRequest(null);
    const api = fakeApi({ select });

    engine.joinRace(api, testRace({ id: uuid(1) }));
    engine.createRace(api, "New race");
    await flush();

    // The join (this session's first selection) updates the shared
    // default; the create that follows is local-only and sends nothing
    // beyond its own create event.
    expect(select).toHaveBeenCalledExactlyOnceWith({ json: { id: uuid(1) } });
  });

  it("coalesces repeated selections into a single sync, sending only the latest", async () => {
    const engine = createOfflineEngine(emptyState());
    const select = mockJSONRequest(null);
    const api = fakeApi({ select });

    // First selection arms the pending sync; the rest only move the local
    // pointer (already past this session's one eligible selection).
    engine.joinRace(api, testRace({ id: uuid(1) }));
    engine.selectRace(api, testRace({ id: uuid(2) }));
    engine.selectRace(api, testRace({ id: uuid(3) }));
    await flush();

    expect(select).toHaveBeenCalledExactlyOnceWith({ json: { id: uuid(1) } });
  });

  it("coalesces repeated lap filter edits into a single sync with the latest value", async () => {
    const race = testRace();
    const engine = createOfflineEngine({ ...emptyState(), selectedRace: race });
    const lapFilter = mockJSONRequest(null);
    const api = fakeApi({ lapFilter });

    engine.setLapFilter(api, race, 3);
    engine.setLapFilter(api, race, 8);
    await flush();

    expect(lapFilter).toHaveBeenCalledExactlyOnceWith({
      param: { id: race.id },
      json: { lapFilterSeconds: 8 },
    });
  });

  it("syncs coalesced selection/lap-filter only after queued events drain", async () => {
    const engine = createOfflineEngine(emptyState());
    const order: string[] = [];
    const join = vi.fn(async () => {
      order.push("join");
      return jsonResponse(null);
    });
    const select = vi.fn(async () => {
      order.push("select");
      return jsonResponse(null);
    });
    const api = fakeApi({ join, select });

    engine.joinRace(api, testRace());
    await flush();

    expect(order).toEqual(["join", "select"]);
  });

  it("stops draining on a network failure and resumes once it can send again", async () => {
    const engine = createOfflineEngine(emptyState());
    const scan$post = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce(jsonResponse(null));
    const api = fakeApi({ scan: scan$post });

    engine.joinRace(api, testRace()); // seeds a selected race
    await flush();
    await engine.scan(api, "bib:1");
    await flush();

    expect(engine.pendingCount()).toBe(1); // scan still queued after the failure

    await engine.drain(api);
    expect(engine.pendingCount()).toBe(0);
    expect(scan$post).toHaveBeenCalledTimes(2);
  });

  it("drops an action the server permanently rejects instead of blocking the queue", async () => {
    const engine = createOfflineEngine(emptyState());
    const scan$post = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 400 }));
    const api = fakeApi({ scan: scan$post, join: mockJSONRequest(null) });

    engine.joinRace(api, testRace());
    await flush();
    await engine.scan(api, "bib:1");
    await engine.drain(api);

    expect(engine.pendingCount()).toBe(0);
  });

  it("falls back to a locally known race when previewing fails offline", async () => {
    const race = testRace({ id: uuid(2), name: "Trail Run" });
    const engine = createOfflineEngine({
      ...emptyState(),
      races: [race],
    });
    const preview = vi.fn().mockRejectedValue(new TypeError("offline"));

    const found = await engine.previewRace(fakeApi({ preview }), race.id);
    expect(found).toEqual(race);
  });

  it("throws previewing a race that isn't known locally either", async () => {
    const engine = createOfflineEngine(emptyState());
    const preview = vi.fn().mockRejectedValue(new TypeError("offline"));

    await expect(
      engine.previewRace(fakeApi({ preview }), uuid(3)),
    ).rejects.toThrow();
  });

  it("does not resync while actions are still queued", async () => {
    const engine = createOfflineEngine(emptyState());
    const races = mockJSONRequest([testRace()]);
    const join = vi.fn().mockRejectedValue(new TypeError("offline"));

    engine.joinRace(fakeApi({ join }), testRace());
    await flush();
    await engine.resync(fakeApi({ races }));

    expect(races).not.toHaveBeenCalled();
  });
});
