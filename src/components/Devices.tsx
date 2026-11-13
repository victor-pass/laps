import {
  Component,
  createEffect,
  createResource,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Suspense,
  Switch,
} from "solid-js";
import { context } from "@/context";
import type { DeviceData, LapData } from "@/api";
import { deviceName, deviceNames } from "@/deviceName";

interface Props {
  raceId: string;
  laps?: LapData[];
  selected?: string;
  onSelect?: (id: string) => void;
  onNames?: (names: Map<string, string>) => void;
}

const LIVE_MS = 5 * 60_000;
const IDLE_MS = 30 * 60_000;

const time = (iso: string) => new Date(iso).toLocaleTimeString();

export const Devices: Component<Props> = (props) => {
  const { api, deviceId, offline } = context();
  // Set after hydration as device will mismatch the servers.
  const [thisDevice, setThisDevice] = createSignal<string>();
  const [now, setNow] = createSignal<number>();
  onMount(() => {
    setThisDevice(deviceId);
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    onCleanup(() => clearInterval(timer));
  });

  // null when offline - other devices' reports need the server.
  const [devices] = createResource(
    () => props.raceId,
    async (raceId): Promise<DeviceData[] | null> => {
      try {
        const res = await api.races[":id"].devices.$get({
          param: { id: raceId },
        });
        return (await res.json()) as DeviceData[];
      } catch {
        return null;
      }
    },
  );

  const scans = () => {
    const byDevice = new Map<string, { count: number; last: string }>();
    for (const lap of props.laps ?? []) {
      if (!lap.device) continue;
      const seen = byDevice.get(lap.device);
      byDevice.set(lap.device, {
        count: (seen?.count ?? 0) + 1,
        last:
          seen && Date.parse(seen.last) > Date.parse(lap.timestamp)
            ? seen.last
            : lap.timestamp,
      });
    }
    return byDevice;
  };

  const names = () => {
    const labels = new Map<string, string>();
    for (const lap of props.laps ?? [])
      if (lap.device && lap.deviceLabel)
        labels.set(lap.device, lap.deviceLabel);
    for (const device of devices() ?? [])
      if (device.label) labels.set(device.id, device.label);
    const ids = [
      ...new Set([...(devices() ?? []).map((d) => d.id), ...scans().keys()]),
    ];
    const generated = deviceNames(ids);
    return new Map(ids.map((id) => [id, labels.get(id) ?? generated.get(id)!]));
  };
  createEffect(() => props.onNames?.(names()));

  // Seen recently enough to still be reporting, by its last request.
  const activity = (device: DeviceData) => {
    const at = now();
    if (at === undefined) return "";
    const ago = at - Date.parse(device.lastSeen);
    return ago < LIVE_MS ? "live" : ago < IDLE_MS ? "idle" : "gone";
  };

  const ownScans = () => {
    const id = thisDevice();
    return id ? (scans().get(id)?.count ?? 0) : 0;
  };
  const waiting = () => {
    const laps = offline.pendingLaps();
    return `${laps} lap${laps === 1 ? "" : "s"} waiting to sync`;
  };

  return (
    <Suspense fallback={<p>Loading devices...</p>}>
      <div class="devices">
        <Show when={thisDevice()}>
          {(id) => (
            <Switch
              fallback={
                <div class="this-device synced">
                  <p>
                    <strong>{deviceName(id())}</strong> (this device) is up to
                    date
                  </p>
                  <p class="hint">
                    {ownScans()} scan{ownScans() === 1 ? "" : "s"} from here
                  </p>
                </div>
              }
            >
              <Match when={offline.signedOut()}>
                <div class="this-device waiting">
                  <p>
                    <strong>{deviceName(id())}</strong> is signed out
                    {offline.pendingLaps() ? ` - ${waiting()}` : ""}
                  </p>
                  <p class="hint">Sign in to send them; they're saved here.</p>
                </div>
              </Match>
              <Match when={offline.pendingCount()}>
                <div class="this-device waiting">
                  <p>
                    <strong>{deviceName(id())}</strong>
                    {offline.unreachable() ? " is offline" : " is syncing"}
                    {offline.pendingLaps() ? ` - ${waiting()}` : ""}
                  </p>
                  <p class="hint">
                    Saved on this device; they'll send once it's back online.
                  </p>
                </div>
              </Match>
            </Switch>
          )}
        </Show>
        <h3>
          Devices{" "}
          <small class="devices-count">
            {devices()?.length ?? 0} device
            {devices()?.length === 1 ? "" : "s"} reporting
          </small>
        </h3>
        <Show when={devices() === null}>
          <p class="hint">Other devices' reports need a connection.</p>
        </Show>
        <Show when={devices()?.length}>
          <table class="sheet">
            <thead>
              <tr>
                <th scope="col">Device</th>
                <th scope="col">User</th>
                <th scope="col" class="num">
                  Scans
                </th>
                <th scope="col" class="num">
                  Last scan
                </th>
              </tr>
            </thead>
            <tbody>
              <For each={devices()}>
                {(device) => (
                  <tr
                    classList={{
                      current: device.id === thisDevice(),
                      selected: device.id === props.selected,
                    }}
                  >
                    <td class="device-name">
                      <span
                        class={`activity ${activity(device)}`}
                        title={`Last seen ${time(device.lastSeen)}`}
                      />
                      <button
                        type="button"
                        class="pick"
                        aria-pressed={device.id === props.selected}
                        onClick={() => props.onSelect?.(device.id)}
                      >
                        {names().get(device.id)}
                      </button>
                      <Show when={device.id === thisDevice()}>
                        {" "}
                        <span class="badge">this device</span>
                      </Show>
                    </td>
                    <td class="device-user">{device.user}</td>
                    <td class="num device-scans">
                      {scans().get(device.id)?.count ?? 0}
                    </td>
                    <td class="num device-last">
                      {scans().has(device.id)
                        ? time(scans().get(device.id)!.last)
                        : "—"}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <p class="hint">
            <span class="activity live" /> seen in the last 5 min{" "}
            <span class="activity idle" /> 5–30 min{" "}
            <span class="activity gone" /> longer. Tap a device to see its
            scans.
          </p>
        </Show>
      </div>
    </Suspense>
  );
};
