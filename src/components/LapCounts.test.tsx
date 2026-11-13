import { expect, describe, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { LapCounts } from "./LapCounts";
import { TestContext } from "@/test/TestContext";
import { testLap, testRace, uuid } from "@/test/fixtures";
import { loadViews } from "@/test/Views/";
import type { LapData, RaceData } from "@/api";
import { collapseLaps } from "@/lapDedupe";

function renderCounts(
  laps: LapData[],
  lapFilterSeconds = 5,
  race: Partial<RaceData> = {},
) {
  return loadViews(
    render(() => (
      <TestContext>
        <LapCounts
          race={testRace({ id: uuid(1), lapFilterSeconds, ...race })}
          laps={laps}
          counted={new Set(collapseLaps(laps, lapFilterSeconds))}
        />
      </TestContext>
    )),
  );
}

describe("LapCounts", () => {
  it("groups laps by runner, counting only the laps that count", async () => {
    const views = renderCounts([
      testLap({ runner: "runner-1", timestamp: "2026-01-01T00:00:00.000Z" }),
      testLap({ runner: "runner-1", timestamp: "2026-01-01T00:00:03.000Z" }), // within 5s - collapsed
      testLap({ runner: "runner-1", timestamp: "2026-01-01T00:00:10.000Z" }), // 10s after first kept - counts
      testLap({ runner: "runner-2", timestamp: "2026-01-01T00:00:00.000Z" }),
    ]);

    const lapCounts = await views.lapCounts();
    expect(lapCounts.items()).toStrictEqual([
      { name: "—", id: "runner-1", count: 2 },
      { name: "—", id: "runner-2", count: 1 },
    ]);
    expect(lapCounts.total).toStrictEqual("2 racers · 3 laps");
    expect(lapCounts.filterNote).toContain(
      "Scans within 5s of a racer's last lap count once (1 not counted).",
    );
    expect(lapCounts.filterNote).toContain("Change on the Race page");
  });

  it("shows distance per racer and in total when the race has a lap distance", async () => {
    const laps = [
      testLap({ runner: "runner-1", timestamp: "2026-01-01T00:00:00.000Z" }),
      testLap({ runner: "runner-1", timestamp: "2026-01-01T00:01:00.000Z" }),
      testLap({ runner: "runner-2", timestamp: "2026-01-01T00:00:00.000Z" }),
    ];
    const views = renderCounts(laps, 5, { lapDistance: 0.25, distanceUnit: "mi" });

    const lapCounts = await views.lapCounts();
    expect(lapCounts.headers).toContain("Distance (mi)");
    expect(lapCounts.distances()).toStrictEqual(["0.5", "0.25"]);
    expect(lapCounts.total).toStrictEqual("2 racers · 3 laps · 0.75 mi");
  });

  it("leaves distance out when the race has none", async () => {
    const views = renderCounts([testLap()]);

    const lapCounts = await views.lapCounts();
    expect(lapCounts.headers).not.toContain("Distance (km)");
    expect(lapCounts.distances()).toStrictEqual([undefined]);
  });

  it("shows each runner by name", async () => {
    const views = renderCounts([
      testLap({ runner: "runner-1", info: "Bib 42" }),
      testLap({ runner: "runner-2", info: { name: "Jamie" } }),
      testLap({
        runner: "runner-2",
        info: { name: "Jamie" },
        timestamp: "1970-01-01T00:01:00.000Z",
      }),
      testLap({ runner: "runner-3", info: { bib: 7 } }),
    ]);

    const lapCounts = await views.lapCounts();
    // No usable name leaves the name cell blank; the id column still shows it.
    expect(lapCounts.items()).toStrictEqual([
      { name: "Jamie", id: "runner-2", count: 2 },
      { name: "Bib 42", id: "runner-1", count: 1 },
      { name: "—", id: "runner-3", count: 1 },
    ]);
  });

  it("lays the counts out as a table with name, id and laps columns", async () => {
    const runner = "3f2a9c1e-0000-4000-8000-000000000042";
    const views = renderCounts([testLap({ runner, info: "Bib 42" })]);

    const lapCounts = await views.lapCounts();
    expect(lapCounts.headers).toStrictEqual(["Name", "Runner ID", "Laps"]);
    // The cell shows a short id; the full one is in the tooltip.
    expect(lapCounts.text).toContain("3f2a9c1e");
    expect(lapCounts.text).not.toContain(runner);
    expect(lapCounts.items()).toStrictEqual([
      { name: "Bib 42", id: runner, count: 1 },
    ]);
  });
});
