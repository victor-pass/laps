import {
  Component,
  createMemo,
  createResource,
  createSignal,
  Show,
  Suspense,
} from "solid-js";
import { context } from "@/context";
import type { LapData, RaceData } from "@/api";
import { Devices } from "@/components/Devices";
import { LapCounts } from "@/components/LapCounts";
import { RecentScans } from "@/components/RecentScans";
import { collapseLaps } from "@/lapDedupe";
import { useSelectedRace } from "@/selectedRace";

// The Sync page: is this device synced, which devices are reporting, and
// what has been counted.
export const Summary: Component = () => {
  const race = useSelectedRace();

  // Keyed on the race id so switching races starts afresh, while a change
  // to the same race, like a new lap filter, doesn't reset anything.
  return (
    <Suspense fallback={<p>Loading laps...</p>}>
      <Show when={race()?.id} keyed>
        {/* Takes the id so Show calls it once per race, untracked. */}
        {(_raceId) => <SyncPage race={race()!} />}
      </Show>
    </Suspense>
  );
};

const SyncPage: Component<{ race: RaceData }> = (props) => {
  const { api, offline } = context();

  const [laps] = createResource(
    () => props.race.id,
    async (raceId) => {
      try {
        const res = await api.races[":id"].laps.$get({ param: { id: raceId } });
        return (await res.json()) as LapData[];
      } catch {
        // Offline with nothing cached by the service worker: the laps this
        // device knows about (the server's as of its last sync, plus its
        // own scans since). Runner names, and the device and user behind each
        // lap, are only stored server-side.
        return (offline.state().lapsByRace[raceId] ?? []).map(
          (lap, i): LapData => ({
            id: -1 - i,
            race: raceId,
            info: null,
            name: null,
            device: null,
            deviceLabel: null,
            user: null,
            userName: null,
            ...lap,
          }),
        );
      }
    },
  );

  // Decided over every device's laps, so a racer scanned at two gates at
  // once counts once whichever device is being looked at.
  const counted = createMemo(
    () => new Set(collapseLaps(laps() ?? [], props.race.lapFilterSeconds)),
  );

  const [device, setDevice] = createSignal<string>();
  const [deviceNames, setDeviceNames] = createSignal(new Map<string, string>());
  const shown = () =>
    device()
      ? (laps() ?? []).filter((lap) => lap.device === device())
      : (laps() ?? []);

  return (
    <div class="sync-page">
      <h2>Sync status: {props.race.name}</h2>
      <Devices
        raceId={props.race.id}
        laps={laps() ?? []}
        selected={device()}
        onSelect={(id) => setDevice(id === device() ? undefined : id)}
        onNames={setDeviceNames}
      />
      <Show when={device()}>
        {(id) => (
          <p class="device-filter">
            <span>
              Showing scans from <strong>{deviceNames().get(id())}</strong>
            </span>
            <button type="button" onClick={() => setDevice(undefined)}>
              ✕ All devices
            </button>
          </p>
        )}
      </Show>
      <LapCounts race={props.race} laps={shown()} counted={counted()} />
      <RecentScans
        laps={shown()}
        counted={counted()}
        deviceNames={deviceNames()}
      />
    </div>
  );
};
