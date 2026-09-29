import { context } from "@/context";
import { Component, createResource, For, Show, Suspense } from "solid-js";
import type { RaceData } from "@/api";
import { Devices } from "@/components/Devices";

export const Laps: Component = () => {
  const { api } = context();
  const [race] = createResource(async () => {
    const res = await api.races.selected.$get();
    return (await res.json()) as RaceData | null;
  });
  const [laps] = createResource(race, async (race) => {
    const res = await api.races[":id"].laps.$get({ param: { id: race.id } });
    return res.json();
  });

  return (
    <Suspense fallback={<p>Loading laps...</p>}>
      <Show when={race()}>{(r) => <Devices raceId={r().id} />}</Show>
      <ul class="laps">
        <For each={laps()}>
          {(lap) => (
            <li>
              {lap.runner} at {lap.timestamp}
            </li>
          )}
        </For>
      </ul>
    </Suspense>
  );
};
