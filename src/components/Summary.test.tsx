import { expect, describe, it, vi } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { Summary } from "./Summary";
import { TestContext, testApi } from "@/test/TestContext";
import { createOfflineEngine, emptyState } from "@/offline";
import {
  jsonResponse,
  mockJSONRequest,
  testLap,
  testRace,
  uuid,
} from "@/test/fixtures";
import { loadViews } from "@/test/Views/";

describe("Summary", () => {
  it("shows devices and lap counts for the selected race", async () => {
    const selected$get = mockJSONRequest(testRace({ id: uuid(1) }));
    const laps$get = mockJSONRequest([
      testLap({ runner: "runner-1", timestamp: "2026-09-02T11:30:00.000Z" }),
    ]);
    const devices$get = mockJSONRequest([]);

    const views = loadViews(
      render(() => (
        <TestContext
          api={{
            races: {
              selected: { $get: selected$get },
              ":id": { laps: { $get: laps$get }, devices: { $get: devices$get } },
            },
          }}
        >
          <Summary />
        </TestContext>
      )),
    );

    await views.devices();
    const lapCounts = await views.lapCounts();

    expect(devices$get).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(1) },
    });
    expect(laps$get).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(1) },
    });
    await waitFor(() =>
      expect(lapCounts.items()).toStrictEqual([
        { name: "—", id: "runner-1", count: 1 },
      ]),
    );
  });

  it("switches to a race chosen elsewhere in the app", async () => {
    const spring = testRace({ id: uuid(1), name: "Spring 5k", lapFilterSeconds: 5 });
    const trail = testRace({ id: uuid(2), name: "Trail Run", lapFilterSeconds: 30 });
    const byRace = <T,>(data: Record<string, T>) =>
      vi.fn(async ({ param }: { param: { id: string } }) =>
        jsonResponse(data[param.id]),
      );
    const laps$get = byRace({
      [spring.id]: [testLap({ runner: "spring-runner" })],
      [trail.id]: [testLap({ runner: "trail-runner" })],
    });
    const devices$get = byRace({
      [spring.id]: [],
      [trail.id]: [
        { id: uuid(9), user: "dev", label: "Aid station", lastSeen: "2026-01-01T00:00:00.000Z" },
      ],
    });
    const offline = createOfflineEngine(emptyState());

    const views = loadViews(
      render(() => (
        <TestContext
          offline={offline}
          api={{
            races: {
              selected: { $get: mockJSONRequest(spring) },
              ":id": { laps: { $get: laps$get }, devices: { $get: devices$get } },
            },
          }}
        >
          <Summary />
        </TestContext>
      )),
    );

    const lapCounts = await views.lapCounts();
    await waitFor(() =>
      expect(lapCounts.items().map((r) => r.id)).toEqual(["spring-runner"]),
    );

    // e.g. from the race picker
    offline.selectRace(testApi(), trail);

    await waitFor(async () =>
      expect((await views.lapCounts()).items().map((r) => r.id)).toEqual([
        "trail-runner",
      ]),
    );
    expect((await views.lapCounts()).filterValue).toStrictEqual("30");
    await waitFor(async () =>
      expect((await views.devices()).items().map((d) => d.name)).toEqual([
        "Aid station",
      ]),
    );
  });
});
