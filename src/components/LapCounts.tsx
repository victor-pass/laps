import { Component, For, Show } from "solid-js";
import type { LapData, RaceData } from "@/api";
import { runnerName } from "@/runner";
import { distanceOf, lapDistance } from "@/distance";

interface Props {
  race: RaceData;
  laps: LapData[];
  // The laps that count, after the race's repeat-scan filter.
  counted: Set<LapData>;
}

export const LapCounts: Component<Props> = (props) => {
  const names = () =>
    new Map(props.laps.map((lap) => [lap.runner, runnerName(lap)]));

  const byRunner = () => {
    const counts = new Map<string, number>();
    for (const lap of props.laps)
      if (props.counted.has(lap))
        counts.set(lap.runner, (counts.get(lap.runner) ?? 0) + 1);
    return counts;
  };
  const total = () => [...byRunner().values()].reduce((a, b) => a + b, 0);
  const distance = () => lapDistance(props.race);
  const repeats = () => props.laps.length - total();

  // Most laps first; ties by name, with unnamed runners after named ones.
  const counts = () => {
    const named = names();
    return [...byRunner()].sort(
      ([ra, a], [rb, b]) =>
        b - a ||
        (named.get(ra) ?? "￿").localeCompare(named.get(rb) ?? "￿"),
    );
  };

  return (
    <div class="lap-counts">
      <h3>
        Lap counts{" "}
        <small class="lap-total">
          {counts().length} racer{counts().length === 1 ? "" : "s"} ·{" "}
          {total()} lap{total() === 1 ? "" : "s"}
          <Show when={distance()}>
            {(d) => ` · ${distanceOf(total(), d())} ${d().unit}`}
          </Show>
        </small>
      </h3>
      <table class="sheet">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Runner ID</th>
            <th scope="col" class="num">
              Laps
            </th>
            <Show when={distance()}>
              {(d) => (
                <th scope="col" class="num">
                  Distance ({d().unit})
                </th>
              )}
            </Show>
          </tr>
        </thead>
        <tbody>
          <For
            each={counts()}
            fallback={
              <tr>
                <td class="empty" colspan={distance() ? 4 : 3}>
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
                <Show when={distance()}>
                  {(d) => <td class="num distance">{distanceOf(count, d())}</td>}
                </Show>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <p class="hint lap-filter-note">
        Scans within {props.race.lapFilterSeconds}s of a racer's last lap count
        once
        {repeats() ? ` (${repeats()} not counted)` : ""}.{" "}
        {/* A plain link (the router still handles it) so this works
            outside a router too. */}
        <a href="/race">Change on the Race page</a>
      </p>
    </div>
  );
};
