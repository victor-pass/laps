import { context } from "@/context";
import { Component, createResource, Show, Suspense } from "solid-js";
import type { RaceData } from "@/api";
import { Devices } from "@/components/Devices";
import { LapCounts } from "@/components/LapCounts";

export const Summary: Component = () => {
  const { api } = context();
  const [race] = createResource(async () => {
    const res = await api.races.selected.$get();
    return (await res.json()) as RaceData | null;
  });

  return (
    <Suspense fallback={<p>Loading laps...</p>}>
      <Show when={race()}>
        {(r) => (
          <>
            <Devices raceId={r().id} />
            <LapCounts race={r()} />
          </>
        )}
      </Show>
    </Suspense>
  );
};
