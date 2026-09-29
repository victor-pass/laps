import { expect, describe, it } from "vitest";
import { collapseLaps, countByRunner } from "@/lapDedupe";

function lap(runner: string, isoTimestamp: string) {
  return { runner, timestamp: isoTimestamp };
}

describe("collapseLaps", () => {
  it("keeps a runner's first lap", () => {
    const laps = [lap("a", "2026-01-01T00:00:00.000Z")];
    expect(collapseLaps(laps, 5)).toEqual(laps);
  });

  it("drops a lap within the threshold of the previously kept one", () => {
    const laps = [
      lap("a", "2026-01-01T00:00:00.000Z"),
      lap("a", "2026-01-01T00:00:03.000Z"), // 3s later
    ];
    expect(collapseLaps(laps, 5)).toEqual([laps[0]]);
  });

  it("keeps a lap at or beyond the threshold", () => {
    const laps = [
      lap("a", "2026-01-01T00:00:00.000Z"),
      lap("a", "2026-01-01T00:00:05.000Z"), // exactly 5s later
    ];
    expect(collapseLaps(laps, 5)).toEqual(laps);
  });

  it("keeps laps for a runner relative to their own last kept lap, not a dropped one", () => {
    const laps = [
      lap("a", "2026-01-01T00:00:00.000Z"),
      lap("a", "2026-01-01T00:00:03.000Z"), // dropped, 3s after kept
      lap("a", "2026-01-01T00:00:06.000Z"), // 6s after the *kept* lap - kept
    ];
    expect(collapseLaps(laps, 5)).toEqual([laps[0], laps[2]]);
  });

  it("scopes the window independently per runner", () => {
    const laps = [
      lap("a", "2026-01-01T00:00:00.000Z"),
      lap("b", "2026-01-01T00:00:01.000Z"),
    ];
    expect(collapseLaps(laps, 5)).toEqual(laps);
  });

  it("sorts out-of-order input before collapsing", () => {
    const early = lap("a", "2026-01-01T00:00:00.000Z");
    const late = lap("a", "2026-01-01T00:00:10.000Z");
    expect(collapseLaps([late, early], 5)).toEqual([early, late]);
  });
});

describe("countByRunner", () => {
  it("counts collapsed laps per runner", () => {
    const laps = [
      lap("a", "2026-01-01T00:00:00.000Z"),
      lap("a", "2026-01-01T00:00:03.000Z"),
      lap("a", "2026-01-01T00:00:10.000Z"),
      lap("b", "2026-01-01T00:00:00.000Z"),
    ];
    expect(countByRunner(laps, 5)).toEqual(
      new Map([
        ["a", 2],
        ["b", 1],
      ]),
    );
  });
});
