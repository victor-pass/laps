import {
  Component,
  createResource,
  createSignal,
  For,
  Suspense,
} from "solid-js";
import { context } from "@/context";
import type { LapData, RaceData } from "@/api";
import { countByRunner } from "@/lapDedupe";
import { runnerName } from "@/runner";
import { lapsCsv, lapsCsvFilename } from "@/lapsCsv";

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
      try {
        const res = await api.races[":id"].laps.$get({ param: { id: raceId } });
        return (await res.json()) as LapData[];
      } catch {
        // Offline with nothing cached by the service worker: the laps this
        // device knows about (the server's as of its last sync, plus its
        // own scans since). Runner names and which device scanned each lap
        // are only stored server-side.
        return (offline.state().lapsByRace[raceId] ?? []).map(
          (lap, i): LapData => ({
            id: -1 - i,
            race: raceId,
            info: null,
            device: null,
            deviceLabel: null,
            ...lap,
          }),
        );
      }
    },
  );

  const names = () =>
    new Map((laps() ?? []).map((lap) => [lap.runner, runnerName(lap.info)]));

  // Most laps first; ties by name, with unnamed runners after named ones.
  const counts = () =>
    [...countByRunner(laps() ?? [], filterSeconds())].sort(
      ([ra, a], [rb, b]) =>
        b - a ||
        (names().get(ra) ?? "\uffff").localeCompare(
          names().get(rb) ?? "\uffff",
        ),
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

  const exportCsv = () => {
    const blob = new Blob([lapsCsv(laps() ?? [])], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = lapsCsvFilename(props.race.name);
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div class="lap-counts">
      <Suspense fallback={<p>Loading laps...</p>}>
        <table class="sheet">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Runner ID</th>
              <th scope="col" class="num">
                Laps
              </th>
            </tr>
          </thead>
          <tbody>
            <For
              each={counts()}
              fallback={
                <tr>
                  <td class="empty" colspan="3">
                    No laps yet
                  </td>
                </tr>
              }
            >
              {([runner, count]) => (
                <tr class="runner-row">
                  <td class="name">
                    {names().get(runner) ?? <span class="unnamed">—</span>}
                  </td>
                  <td class="id" title={runner}>
                    {runner.slice(0, 8)}
                  </td>
                  <td class="num count">{count}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Suspense>
      <section class="race-settings">
        <h2>Race settings</h2>
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
        <button
          type="button"
          class="export-laps"
          disabled={!laps()?.length}
          onClick={exportCsv}
        >
          Export laps (CSV)
        </button>
      </section>
    </div>
  );
};
