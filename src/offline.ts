import { createSignal } from "solid-js";
import type { ApiClient, LapData, RaceData, RunnerData, ScanResult } from "@/api";
import { runnerRef } from "@/runner";
import { collapseLaps, DEFAULT_LAP_FILTER_SECONDS } from "@/lapDedupe";
import type { RaceLink } from "@/qr";

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

// Events: each one is a distinct thing that happened and must be replayed
// exactly, in order, with nothing dropped or merged.
type PendingAction =
  | { kind: "createRace"; id: string; name: string }
  | { kind: "joinRace"; id: string }
  | {
      kind: "scan";
      race: string;
      runner: string;
      data: string;
      timestamp: string;
    };

interface PendingLapFilter {
  race: string;
  seconds: number;
}

interface Persisted {
  state: LocalState;
  queue: PendingAction[];
  // Coalesced state, not events: only the latest value matters, so editing
  // either of these five times locally still sends at most one request per
  // sync, not five. Synced after `queue` drains, since either can
  // reference a race that only just got created/joined offline.
  pendingSelect?: string;
  pendingLapFilter?: PendingLapFilter;
}

// The request couldn't be delivered yet - no network, a server error, or
// this device's login has expired - so it stays queued for the next sync.
class RetryLater extends Error {}

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
  // The server rejected this device's login (e.g. it expired). Queued work
  // is kept until the user signs in again.
  signedOut(): boolean;
  previewRace(api: ApiClient, link: RaceLink): Promise<RaceData>;
  joinRace(api: ApiClient, race: RaceData): void;
  createRace(api: ApiClient, name: string): RaceData;
  selectRace(api: ApiClient, race: RaceData): void;
  setLapFilter(api: ApiClient, race: RaceData, seconds: number): void;
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
  // A selection counts as the device's "startup" choice only once per page
  // load - the first one after a fresh load or a genuinely new device is
  // allowed to update the server's default race for the next fresh start;
  // anything after that is a switch made on an already-running app and
  // must not change what other sessions bootstrap into.
  let usedStartupSlot = false;
  let draining = false;

  // Every change goes through persist(), so bumping this there lets any
  // component that reads state() in a reactive scope (e.g. the race picker)
  // update when a race is joined or selected anywhere in the app.
  const [changed, notifyChanged] = createSignal(undefined, { equals: false });

  const [signedOut, setSignedOut] = createSignal(false);

  const persist = () => {
    notifyChanged();
    if (persistToStorage) save(store);
  };

  function isStartupSelection(): boolean {
    if (usedStartupSlot) return false;
    usedStartupSlot = true;
    return true;
  }

  // Shared by createRace/joinRace/selectRace: always applies locally so
  // this device renders the new race immediately; only arms the coalesced
  // server sync when this is the session's startup selection.
  function applySelection(race: RaceData) {
    if (!store.state.races.some((r) => r.id === race.id)) {
      store.state.races.push(race);
    }
    store.state.selectedRace = race;
    if (isStartupSelection()) store.pendingSelect = race.id;
  }

  function countForRunner(
    raceId: string,
    runner: string,
    thresholdSeconds: number,
  ): number {
    const laps = (store.state.lapsByRace[raceId] ?? []).filter(
      (l) => l.runner === runner,
    );
    return collapseLaps(laps, thresholdSeconds).length;
  }

  function recordLocalLap(race: string, runner: string, timestamp: string) {
    (store.state.lapsByRace[race] ??= []).push({ runner, timestamp });
  }

  function hasPendingWork(): boolean {
    return (
      store.queue.length > 0 ||
      store.pendingSelect !== undefined ||
      store.pendingLapFilter !== undefined
    );
  }

  function request(api: ApiClient, action: PendingAction) {
    switch (action.kind) {
      case "createRace":
        return api.races.$post({
          json: { id: action.id, name: action.name },
        });
      case "joinRace":
        return api.races[":id"].join.$post({ param: { id: action.id } });
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

  async function requestOk(
    response: Promise<{ ok: boolean; status: number }>,
  ) {
    let ok: boolean, status: number;
    try {
      const res = await response;
      ok = res.ok;
      status = res.status;
    } catch {
      throw new RetryLater();
    }
    setSignedOut(status === 401);
    if (ok) return;
    if (status >= 500 || status === 401) throw new RetryLater();
    // Any other 4xx means the request reached the server and was rejected
    // (e.g. malformed data) - it can never succeed by retrying, so drop it
    // rather than blocking everything queued behind it forever.
  }

  async function drainQueue(api: ApiClient) {
    while (store.queue.length > 0) {
      try {
        await requestOk(request(api, store.queue[0]));
      } catch (e) {
        if (e instanceof RetryLater) return false;
        throw e;
      }
      store.queue.shift();
      persist();
    }
    return true;
  }

  async function drainSelect(api: ApiClient) {
    const id = store.pendingSelect;
    if (id === undefined) return true;
    try {
      await requestOk(
        api.races.selected.$put({ json: { id } }),
      );
    } catch (e) {
      if (e instanceof RetryLater) return false;
      throw e;
    }
    // Only clear if nothing newer arrived while this was in flight.
    if (store.pendingSelect === id) store.pendingSelect = undefined;
    persist();
    return true;
  }

  async function drainLapFilter(api: ApiClient) {
    const pending = store.pendingLapFilter;
    if (pending === undefined) return true;
    try {
      await requestOk(
        api.races[":id"].$patch({
          param: { id: pending.race },
          json: { lapFilterSeconds: pending.seconds },
        }),
      );
    } catch (e) {
      if (e instanceof RetryLater) return false;
      throw e;
    }
    if (
      store.pendingLapFilter?.race === pending.race &&
      store.pendingLapFilter.seconds === pending.seconds
    ) {
      store.pendingLapFilter = undefined;
    }
    persist();
    return true;
  }

  async function drain(api: ApiClient) {
    if (draining) return;
    draining = true;
    try {
      // Events first, in order - a coalesced select/lap-filter might
      // reference a race that only just got created/joined offline.
      if (!(await drainQueue(api))) return;
      if (!(await drainSelect(api))) return;
      await drainLapFilter(api);
    } finally {
      draining = false;
    }
  }

  async function resync(api: ApiClient) {
    if (hasPendingWork()) return; // don't clobber unsynced local state
    try {
      const [racesRes, selectedRes] = await Promise.all([
        api.races.$get(),
        api.races.selected.$get(),
      ]);
      setSignedOut(racesRes.status === 401 || selectedRes.status === 401);
      if (!racesRes.ok || !selectedRes.ok) return;
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
    state: () => {
      changed();
      return store.state;
    },
    pendingCount: () =>
      (changed(), store.queue.length) +
      (store.pendingSelect !== undefined ? 1 : 0) +
      (store.pendingLapFilter !== undefined ? 1 : 0),

    signedOut,
    previewRace: (api, link) => previewRace(api, link, store.state.races),

    joinRace(api, race) {
      applySelection(race);
      store.queue.push({ kind: "joinRace", id: race.id });
      persist();
      void drain(api);
    },

    createRace(api, name) {
      const race: RaceData = {
        id: crypto.randomUUID(),
        name,
        lapFilterSeconds: DEFAULT_LAP_FILTER_SECONDS,
      };
      applySelection(race);
      store.queue.push({ kind: "createRace", id: race.id, name });
      persist();
      void drain(api);
      return race;
    },

    // For picking a race the device already belongs to (e.g. from the
    // dropdown) - unlike joinRace, this never re-sends membership.
    selectRace(api, race) {
      applySelection(race);
      persist();
      void drain(api);
    },

    setLapFilter(api, race, seconds) {
      if (store.state.selectedRace?.id === race.id) {
        store.state.selectedRace = { ...store.state.selectedRace, lapFilterSeconds: seconds };
      }
      const known = store.state.races.find((r) => r.id === race.id);
      if (known) known.lapFilterSeconds = seconds;
      store.pendingLapFilter = { race: race.id, seconds };
      persist();
      void drain(api);
    },

    async scan(api, data) {
      const race = store.state.selectedRace;
      if (!race) throw new Error("No race selected");

      const ref = await runnerRef(data);
      const timestamp = new Date().toISOString();
      recordLocalLap(race.id, ref, timestamp);
      // Recomputed (not incremented) after recording, so a scan that lands
      // within the race's own filter window of the runner's last counted
      // lap correctly doesn't bump the shown count.
      const lapCount = countForRunner(race.id, ref, race.lapFilterSeconds);
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

// The server's copy of a race when it can be reached. When it can't, falls
// back to what this device already knows, then to the details carried in
// the join link itself, so a volunteer can join and start scanning offline.
// A race the server says doesn't exist is never faked from the link -
// joining it would get dropped on sync, taking every lap queued behind it.
export async function previewRace(
  api: ApiClient,
  link: RaceLink,
  known: RaceData[],
): Promise<RaceData> {
  // undefined when offline - fall through to local details
  const res = await api.races[":id"]
    .$get({ param: { id: link.id } })
    .catch(() => undefined);
  if (res?.ok) return (await res.json()) as RaceData;
  // Signed out says nothing about the race, so that's treated like offline.
  if (res && res.status < 500 && res.status !== 401)
    throw new Error("Race not found");

  const local = known.find((r) => r.id === link.id);
  if (local) return local;
  if (link.name)
    return {
      id: link.id,
      name: link.name,
      lapFilterSeconds: DEFAULT_LAP_FILTER_SECONDS,
    };
  throw new Error("Race not found");
}

// Used for server-side rendering, where there's no browser storage and no
// real interaction happens - it only needs to satisfy the interface.
export const noopOfflineEngine: OfflineEngine = {
  state: () => ({ selectedRace: undefined, races: [], lapsByRace: {} }),
  pendingCount: () => 0,
  signedOut: () => false,
  // Still fetches, so a server render of a join link shows the race.
  previewRace: (api, link) => previewRace(api, link, []),
  joinRace: () => {},
  createRace: (_api, name) => ({
    id: crypto.randomUUID(),
    name,
    lapFilterSeconds: DEFAULT_LAP_FILTER_SECONDS,
  }),
  selectRace: () => {},
  setLapFilter: () => {},
  scan: () => Promise.reject(new Error("unavailable during render")),
  drain: () => Promise.resolve(),
  resync: () => Promise.resolve(),
};

// Flushes anything queued from a previous session, hydrates local state
// from the server once everything is confirmed synced, and keeps doing
// both whenever the browser regains connectivity.
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
