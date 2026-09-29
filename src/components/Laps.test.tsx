import { expect, describe, it } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { Laps } from "./Laps";
import { TestContext } from "@/test/TestContext";
import { mockJSONRequest, testLap, testRace, uuid } from "@/test/fixtures";
import { loadViews } from "@/test/Views/";

describe("Laps", () => {
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
          <Laps />
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
        { runner: "runner-1", count: 1 },
      ]),
    );
  });
});
