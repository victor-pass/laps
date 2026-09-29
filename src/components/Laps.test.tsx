import { expect, describe, it, Mock } from "vitest";
import { render } from "@solidjs/testing-library";
import { Laps } from "./Laps";
import { TestContext } from "@/test/TestContext";
import { mockJSONRequest, testLap, testRace, uuid } from "@/test/fixtures";
import { loadViews } from "@/test/Views/";

describe("Laps", () => {
  it("renders laps for the selected race", async () => {
    const selected$get = mockJSONRequest(testRace({ id: uuid(1) }));
    const laps$get: Mock = mockJSONRequest([
      testLap({ runner: "runner-1", timestamp: "2026-09-02T11:30:00.000Z" }),
    ]);

    const views = loadViews(
      render(() => (
        <TestContext
          api={{
            races: { selected: { $get: selected$get }, ":id": { laps: { $get: laps$get } } },
          }}
        >
          <Laps />
        </TestContext>
      )),
    );
    const laps = await views.laps();

    expect(laps$get).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(1) },
    });

    expect(laps.items()).toStrictEqual([
      { runner: "runner-1", timestamp: "2026-09-02T11:30:00.000Z" },
    ]);
  });
});
