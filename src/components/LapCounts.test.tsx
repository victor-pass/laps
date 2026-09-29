import { expect, describe, it } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { LapCounts } from "./LapCounts";
import { TestContext } from "@/test/TestContext";
import { mockJSONRequest, testLap, testRace, uuid } from "@/test/fixtures";
import { loadViews } from "@/test/Views/";

describe("LapCounts", () => {
  it("groups laps by runner, applying the race's lap filter", async () => {
    const laps$get = mockJSONRequest([
      testLap({ runner: "runner-1", timestamp: "2026-01-01T00:00:00.000Z" }),
      testLap({ runner: "runner-1", timestamp: "2026-01-01T00:00:03.000Z" }), // within 5s - collapsed
      testLap({ runner: "runner-1", timestamp: "2026-01-01T00:00:10.000Z" }), // 10s after first kept - counts
      testLap({ runner: "runner-2", timestamp: "2026-01-01T00:00:00.000Z" }),
    ]);

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { ":id": { laps: { $get: laps$get } } } }}>
          <LapCounts race={testRace({ id: uuid(1), lapFilterSeconds: 5 })} />
        </TestContext>
      )),
    );

    const lapCounts = await views.lapCounts();
    expect(laps$get).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(1) },
    });
    await waitFor(() =>
      expect(lapCounts.items()).toStrictEqual([
        { runner: "runner-1", count: 2 },
        { runner: "runner-2", count: 1 },
      ]),
    );
    expect(lapCounts.filterValue).toStrictEqual("5");
  });

  it("recomputes counts locally and instantly as the filter is edited", async () => {
    const laps$get = mockJSONRequest([
      testLap({ runner: "runner-1", timestamp: "2026-01-01T00:00:00.000Z" }),
      testLap({ runner: "runner-1", timestamp: "2026-01-01T00:00:03.000Z" }),
    ]);

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { ":id": { laps: { $get: laps$get } } } }}>
          <LapCounts race={testRace({ id: uuid(1), lapFilterSeconds: 5 })} />
        </TestContext>
      )),
    );

    const lapCounts = await views.lapCounts();
    await waitFor(() =>
      expect(lapCounts.items()).toStrictEqual([
        { runner: "runner-1", count: 1 },
      ]),
    );

    lapCounts.setFilter("2");
    expect(lapCounts.items()).toStrictEqual([{ runner: "runner-1", count: 2 }]);
  });

  it("persists the filter on commit", async () => {
    const laps$get = mockJSONRequest([]);
    const patch$patch = mockJSONRequest(null);

    const views = loadViews(
      render(() => (
        <TestContext
          api={{
            races: {
              ":id": { laps: { $get: laps$get }, $patch: patch$patch },
            },
          }}
        >
          <LapCounts race={testRace({ id: uuid(1), lapFilterSeconds: 5 })} />
        </TestContext>
      )),
    );

    const lapCounts = await views.lapCounts();
    lapCounts.commitFilter("8");

    await waitFor(() =>
      expect(patch$patch).toHaveBeenCalledExactlyOnceWith({
        param: { id: uuid(1) },
        json: { lapFilterSeconds: 8 },
      }),
    );
  });
});
