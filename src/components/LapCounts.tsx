import { Component, createResource, createSignal, For, Suspense } from "solid-js";
import { context } from "@/context";
import type { LapData, RaceData } from "@/api";
import { countByRunner } from "@/lapDedupe";

interface Props {
  race: RaceData;
}

export const LapCounts: Component<Props> = (props) => {
  const { api, offline } = context();
  // One-time initial value - the filter is then owned locally and edited
  // through the input, not kept in sync with a later prop change.
  // eslint-disable-next-line solid/reactivity -- intentional one-time read
  const initialFilterSeconds = props.race.lapFilterSeconds;
  const [filterSeconds, setFilterSeconds] = createSignal(initialFilterSeconds);

  const [laps] = createResource(
    () => props.race.id,
    async (raceId) => {
      const res = await api.races[":id"].laps.$get({ param: { id: raceId } });
      return (await res.json()) as LapData[];
    },
  );

  const counts = () =>
    [...countByRunner(laps() ?? [], filterSeconds())].sort(
      ([, a], [, b]) => b - a,
    );

  const parseFilterInput = (e: Event) => {
    const value = Number((e.currentTarget as HTMLInputElement).value);
    return Number.isInteger(value) && value >= 0 ? value : undefined;
  };

  // Applies to the displayed counts immediately - it's a pure local
  // recompute over laps already fetched, not a network round trip.
  const onFilterInput = (e: Event) => {
    const value = parseFilterInput(e);
    if (value !== undefined) setFilterSeconds(value);
  };

  // Persists on commit (blur/Enter) so the value sticks as the race's
  // default for every device, not just this one. Queued and coalesced -
  // applies even offline, and editing it repeatedly before the next sync
  // still sends only the latest value.
  const onFilterChange = (e: Event) => {
    const value = parseFilterInput(e);
    if (value === undefined) return;
    offline.setLapFilter(api, props.race, value);
  };

  return (
    <div class="lap-counts">
      <label class="lap-filter">
        Minimum seconds between counted laps
        <input
          type="number"
          min="0"
          step="1"
          value={filterSeconds()}
          onInput={onFilterInput}
          onChange={onFilterChange}
        />
      </label>
      <Suspense fallback={<p>Loading laps...</p>}>
        <ul>
          <For each={counts()}>
            {([runner, count]) => (
              <li>
                {runner}: {count}
              </li>
            )}
          </For>
        </ul>
      </Suspense>
    </div>
  );
};
