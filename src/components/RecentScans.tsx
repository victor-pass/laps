import { Component, createSignal, For, Show } from "solid-js";
import type { LapData } from "@/api";
import { runnerName } from "@/runner";

const PAGE = 10;

interface Props {
  laps: LapData[];
  // The laps that count; the rest are shown as repeats.
  counted: Set<LapData>;
  deviceNames: Map<string, string>;
}

export const RecentScans: Component<Props> = (props) => {
  const [limit, setLimit] = createSignal(PAGE);
  const newest = () =>
    [...props.laps].sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
    );

  return (
    <div class="recent-scans">
      <h3>
        Recent scans <small>newest first</small>
      </h3>
      <ol class="scan-feed">
        <For
          each={newest().slice(0, limit())}
          fallback={<li class="empty">No scans yet</li>}
        >
          {(lap) => (
            <li class="scan-entry" classList={{ repeat: !props.counted.has(lap) }}>
              <span class="scan-time">
                {new Date(lap.timestamp).toLocaleTimeString()}
              </span>
              <span class="scan-runner">
                {runnerName(lap) ?? lap.runner.slice(0, 8)}
              </span>
              <span class="scan-device">
                {(lap.device && props.deviceNames.get(lap.device)) ?? "—"}
                {props.counted.has(lap) ? "" : " · repeat"}
              </span>
            </li>
          )}
        </For>
      </ol>
      <Show when={props.laps.length > limit()}>
        <button
          type="button"
          class="more-scans"
          onClick={() => setLimit(limit() + PAGE * 2)}
        >
          Show more
        </button>
      </Show>
    </div>
  );
};
