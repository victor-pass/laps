import type { ApiClient, LapData, RaceData, RunnerData, ScanResult } from "@/api";
import { runnerRef } from "@/runner";

const STORAGE_KEY = "laps:offline";

interface LocalLap {
  runner: string;
  timestamp: string;
}

export interface LocalState {
  selectedRace?: RaceData;
  races: RaceData[];
  lapsByRace: Record<string, LocalLap[]>;
}

type PendingAction =
  | { kind: "createRace"; id: string; name: string; updateDefault: boolean }
  | { kind: "joinRace"; id: string; updateDefault: boolean }
  | {
      kind: "scan";
      race: string;
      runner: string;
      data: string;
      timestamp: string;
    };

interface Persisted {
  state: LocalState;
  queue: PendingAction[];
}

class NetworkError extends Error {}

function parseInfo(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

export function emptyState(): LocalState {
  return { selectedRace: undefined, races: [], lapsByRace: {} };
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Persisted;
  } catch {
    // corrupt or unavailable storage - start clean
  }
  return { state: emptyState(), queue: [] };
}

function save(data: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable (private mode, quota) - state stays in-memory only
  }
}

export interface OfflineEngine {
  state(): LocalState;
  pendingCount(): number;
  previewRace(api: ApiClient, id: string): Promise<RaceData>;
  joinRace(api: ApiClient, race: RaceData): void;
  createRace(api: ApiClient, name: string): RaceData;
  scan(api: ApiClient, data: string): Promise<ScanResult>;
  drain(api: ApiClient): Promise<void>;
  resync(api: ApiClient): Promise<void>;
}

// When `seed` is given the engine operates purely in-memory (no
// localStorage read/write), which is what tests use to get deterministic,
// isolated state without needing to stub or clear browser storage.
export function createOfflineEngine(seed?: LocalState): OfflineEngine {
  const store: Persisted = seed ? { state: seed, queue: [] } : load();
  const persistToStorage = !seed;
  // A join/create counts as the device's "startup" selection only once per
  // page load - the first one after a fresh load or a genuinely new device
  // is allowed to update the server's default race for the next fresh
  // start; anything after that is a switch made on an already-running app
  // and must not change what other sessions bootstrap into.
  let usedStartupSlot = false;
  let draining = false;

  const persist = () => {
    if (persistToStorage) save(store);
  };

  function nextUpdateDefault(): boolean {
    if (usedStartupSlot) return false;
    usedStartupSlot = true;
    return true;
  }

  function rememberRace(race: RaceData) {
    if (!store.state.races.some((r) => r.id === race.id)) {
      store.state.races.push(race);
    }
    store.state.selectedRace = race;
  }

  function lapCountFor(race: string, runner: string): number {
    return (store.state.lapsByRace[race] ?? []).filter(
      (l) => l.runner === runner,
    ).length;
  }

  function recordLocalLap(race: string, runner: string, timestamp: string) {
    (store.state.lapsByRace[race] ??= []).push({ runner, timestamp });
  }

  function request(api: ApiClient, action: PendingAction) {
    switch (action.kind) {
      case "createRace":
        return api.races.$post({
          json: {
            id: action.id,
            name: action.name,
            updateDefault: action.updateDefault,
          },
        });
      case "joinRace":
        return api.races[":id"].join.$post({
          param: { id: action.id },
          json: { updateDefault: action.updateDefault },
        });
      case "scan":
        return api.runners.scan.$post({
          json: {
            data: action.data,
            race: action.race,
            timestamp: action.timestamp,
          },
        });
    }
  }

  async function sendOne(api: ApiClient, action: PendingAction) {
    let ok: boolean, status: number;
    try {
      const res = await request(api, action);
      ok = res.ok;
      status = res.status;
    } catch {
      throw new NetworkError();
    }
    if (ok) return;
    if (status >= 500) throw new NetworkError();
    // A 4xx here means the request reached the server and was rejected
    // (e.g. malformed data) - it can never succeed by retrying, so drop it
    // rather than blocking every action queued behind it forever.
  }

  async function drain(api: ApiClient) {
    if (draining) return;
    draining = true;
    try {
      while (store.queue.length > 0) {
        try {
          await sendOne(api, store.queue[0]);
        } catch (e) {
          if (e instanceof NetworkError) return;
          throw e;
        }
        store.queue.shift();
        persist();
      }
    } finally {
      draining = false;
    }
  }

  async function resync(api: ApiClient) {
    if (store.queue.length > 0) return; // don't clobber unsynced local state
    try {
      const [racesRes, selectedRes] = await Promise.all([
        api.races.$get(),
        api.races.selected.$get(),
      ]);
      store.state.races = (await racesRes.json()) as RaceData[];
      store.state.selectedRace =
        ((await selectedRes.json()) as RaceData | null) ?? undefined;

      const race = store.state.selectedRace;
      if (race) {
        const lapsRes = await api.races[":id"].laps.$get({
          param: { id: race.id },
        });
        if (lapsRes.ok) {
          const laps = (await lapsRes.json()) as LapData[];
          store.state.lapsByRace[race.id] = laps.map((l) => ({
            runner: l.runner,
            timestamp: l.timestamp,
          }));
        }
      }
      persist();
    } catch {
      // offline, or the request failed - keep serving local state, try
      // again on the next successful sync
    }
  }

  return {
    state: () => store.state,
    pendingCount: () => store.queue.length,

    async previewRace(api, id) {
      try {
        const res = await api.races[":id"].$get({ param: { id } });
        if (!res.ok) throw new Error("not found");
        return (await res.json()) as RaceData;
      } catch {
        const known = store.state.races.find((r) => r.id === id);
        if (!known) throw new Error("Race not found");
        return known;
      }
    },

    joinRace(api, race) {
      const updateDefault = nextUpdateDefault();
      rememberRace(race);
      store.queue.push({ kind: "joinRace", id: race.id, updateDefault });
      persist();
      void drain(api);
    },

    createRace(api, name) {
      const updateDefault = nextUpdateDefault();
      const race: RaceData = { id: crypto.randomUUID(), name };
      rememberRace(race);
      store.queue.push({
        kind: "createRace",
        id: race.id,
        name,
        updateDefault,
      });
      persist();
      void drain(api);
      return race;
    },

    async scan(api, data) {
      const race = store.state.selectedRace;
      if (!race) throw new Error("No race selected");

      const ref = await runnerRef(data);
      const timestamp = new Date().toISOString();
      const lapCount = lapCountFor(race.id, ref) + 1;
      recordLocalLap(race.id, ref, timestamp);
      store.queue.push({
        kind: "scan",
        race: race.id,
        runner: ref,
        data,
        timestamp,
      });
      persist();
      void drain(api);

      // The server always stores/returns the raw scanned text as-is (see
      // /runners/scan); this only affects the optimistic local popup, so a
      // scan of a pre-provisioned runner with richer structured info still
      // reads back correctly once the device syncs.
      const runnerData: RunnerData = { ref, info: parseInfo(data) };
      return { runner: runnerData, race, lapCount };
    },

    drain,
    resync,
  };
}

// Used for server-side rendering, where there's no browser storage and no
// real interaction happens - it only needs to satisfy the interface.
export const noopOfflineEngine: OfflineEngine = {
  state: () => ({ selectedRace: undefined, races: [], lapsByRace: {} }),
  pendingCount: () => 0,
  previewRace: () => Promise.reject(new Error("unavailable during render")),
  joinRace: () => {},
  createRace: (_api, name) => ({ id: crypto.randomUUID(), name }),
  scan: () => Promise.reject(new Error("unavailable during render")),
  drain: () => Promise.resolve(),
  resync: () => Promise.resolve(),
};

// Flushes anything queued from a previous session, hydrates local state
// from the server once the queue is confirmed empty, and keeps doing both
// whenever the browser regains connectivity.
export async function initSync(
  engine: OfflineEngine,
  api: ApiClient,
): Promise<void> {
  const sync = async () => {
    await engine.drain(api);
    if (engine.pendingCount() === 0) await engine.resync(api);
  };
  await sync();
  window.addEventListener("online", () => void sync());
}
