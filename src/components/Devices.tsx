import { Component, createResource, For, Suspense } from "solid-js";
import { context } from "@/context";
import type { DeviceData } from "@/api";

interface Props {
  raceId: string;
}

export const Devices: Component<Props> = (props) => {
  const { api } = context();
  const [devices] = createResource(
    () => props.raceId,
    async (raceId) => {
      const res = await api.races[":id"].devices.$get({
        param: { id: raceId },
      });
      return (await res.json()) as DeviceData[];
    },
  );

  return (
    <Suspense fallback={<p>Loading devices...</p>}>
      <div class="devices">
        <p class="devices-count">
          {devices()?.length ?? 0} device
          {devices()?.length === 1 ? "" : "s"} reporting
        </p>
        <ul>
          <For each={devices()}>
            {(device) => (
              <li>
                {device.label ?? device.user} - last seen{" "}
                {new Date(device.lastSeen).toLocaleTimeString()}
              </li>
            )}
          </For>
        </ul>
      </div>
    </Suspense>
  );
};
