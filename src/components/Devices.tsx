import {
  Component,
  createResource,
  createSignal,
  For,
  onMount,
  Show,
  Suspense,
} from "solid-js";
import { context } from "@/context";
import type { DeviceData } from "@/api";
import { deviceName, deviceNames } from "@/deviceName";

interface Props {
  raceId: string;
}

export const Devices: Component<Props> = (props) => {
  const { api, deviceId } = context();
  // Set after mount: the server render can't know which device is asking,
  // so reading it during hydration would mismatch the server's HTML.
  const [thisDevice, setThisDevice] = createSignal<string>();
  onMount(() => setThisDevice(deviceId));

  const [devices] = createResource(
    () => props.raceId,
    async (raceId) => {
      try {
        const res = await api.races[":id"].devices.$get({
          param: { id: raceId },
        });
        return (await res.json()) as DeviceData[];
      } catch {
        return []; // offline - other devices' reports need the server
      }
    },
  );

  const names = () => deviceNames((devices() ?? []).map((d) => d.id));

  return (
    <Suspense fallback={<p>Loading devices...</p>}>
      <div class="devices">
        <Show when={thisDevice()}>
          {(id) => (
            <p class="this-device">
              This device: <strong>{deviceName(id())}</strong>
            </p>
          )}
        </Show>
        <p class="devices-count">
          {devices()?.length ?? 0} device
          {devices()?.length === 1 ? "" : "s"} reporting
        </p>
        <Show when={devices()?.length}>
          <table class="sheet">
            <thead>
              <tr>
                <th scope="col">Device</th>
                <th scope="col">User</th>
                <th scope="col" class="num">
                  Last seen
                </th>
              </tr>
            </thead>
            <tbody>
              <For each={devices()}>
                {(device) => (
                  <tr classList={{ current: device.id === thisDevice() }}>
                    <td class="device-name">
                      {device.label ?? names().get(device.id)}
                      <Show when={device.id === thisDevice()}>
                        {" "}
                        <span class="badge">this device</span>
                      </Show>
                    </td>
                    <td class="device-user">{device.user}</td>
                    <td class="num">
                      {new Date(device.lastSeen).toLocaleTimeString()}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>
    </Suspense>
  );
};
