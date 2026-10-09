import { Component, Show, Suspense } from "solid-js";
import { Devices } from "@/components/Devices";
import { LapCounts } from "@/components/LapCounts";
import { useSelectedRace } from "@/selectedRace";

export const Summary: Component = () => {
  const race = useSelectedRace();

  // Keyed on the race id so switching races starts the lap counts afresh
  // (LapCounts takes its filter from the race only once), while a change to
  // the same race, like committing a new filter, doesn't reset anything.
  return (
    <Suspense fallback={<p>Loading laps...</p>}>
      <Show when={race()?.id} keyed>
        {(raceId) => (
          <>
            <Devices raceId={raceId} />
            <LapCounts race={race()!} />
          </>
        )}
      </Show>
    </Suspense>
  );
};
