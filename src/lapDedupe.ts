export const DEFAULT_LAP_FILTER_SECONDS = 5;

interface TimestampedLap {
  runner: string;
  timestamp: string;
}

// Collapses laps down to the ones that count: for each runner (scoped
// independently of every other runner), drops any lap that lands within
// `thresholdSeconds` of the previously *kept* lap for that same runner.
// Doesn't mutate or delete anything - it's a display-time view over
// whatever raw laps were actually recorded.
export function collapseLaps<T extends TimestampedLap>(
  laps: T[],
  thresholdSeconds: number,
): T[] {
  const sorted = [...laps].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  const lastKeptMs = new Map<string, number>();
  const kept: T[] = [];
  for (const lap of sorted) {
    const ms = Date.parse(lap.timestamp);
    const prev = lastKeptMs.get(lap.runner);
    if (prev !== undefined && ms - prev < thresholdSeconds * 1000) continue;
    lastKeptMs.set(lap.runner, ms);
    kept.push(lap);
  }
  return kept;
}

// Counts, per runner, how many of their laps survive the filter.
export function countByRunner<T extends TimestampedLap>(
  laps: T[],
  thresholdSeconds: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const lap of collapseLaps(laps, thresholdSeconds)) {
    counts.set(lap.runner, (counts.get(lap.runner) ?? 0) + 1);
  }
  return counts;
}
