import { afterEach, expect, describe, it, vi } from "vitest";
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
        { name: "—", id: "runner-1", count: 2 },
        { name: "—", id: "runner-2", count: 1 },
      ]),
    );
    expect(lapCounts.filterValue).toStrictEqual("5");
  });

  it("shows each runner by name", async () => {
    const laps$get = mockJSONRequest([
      testLap({ runner: "runner-1", info: "Bib 42" }),
      testLap({ runner: "runner-2", info: { name: "Jamie" } }),
      testLap({
        runner: "runner-2",
        info: { name: "Jamie" },
        timestamp: "1970-01-01T00:01:00.000Z",
      }),
      testLap({ runner: "runner-3", info: { bib: 7 } }),
    ]);

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { ":id": { laps: { $get: laps$get } } } }}>
          <LapCounts race={testRace({ id: uuid(1), lapFilterSeconds: 5 })} />
        </TestContext>
      )),
    );

    const lapCounts = await views.lapCounts();
    // No usable name leaves the name cell blank; the id column still shows it.
    await waitFor(() =>
      expect(lapCounts.items()).toStrictEqual([
        { name: "Jamie", id: "runner-2", count: 2 },
        { name: "Bib 42", id: "runner-1", count: 1 },
        { name: "—", id: "runner-3", count: 1 },
      ]),
    );
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
        { name: "—", id: "runner-1", count: 1 },
      ]),
    );

    lapCounts.setFilter("2");
    expect(lapCounts.items()).toStrictEqual([
      { name: "—", id: "runner-1", count: 2 },
    ]);
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

  describe("export", () => {
    afterEach(() => vi.restoreAllMocks());

    it("downloads every raw lap as a csv named after the race", async () => {
      const createObjectURL = vi
        .spyOn(URL, "createObjectURL")
        .mockReturnValue("blob:laps");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      const laps$get = mockJSONRequest([
        testLap({ runner: "runner-1", timestamp: "2026-01-01T00:00:00.000Z", info: "Bib 42" }),
        testLap({ runner: "runner-1", timestamp: "2026-01-01T00:00:03.000Z", info: "Bib 42" }),
      ]);

      const views = loadViews(
        render(() => (
          <TestContext api={{ races: { ":id": { laps: { $get: laps$get } } } }}>
            <LapCounts race={testRace({ name: "Spring 5k", lapFilterSeconds: 5 })} />
          </TestContext>
        )),
      );

      const lapCounts = await views.lapCounts();
      await waitFor(() => expect(lapCounts.exportButton.disabled).toBe(false));
      lapCounts.exportCsv();

      const link = click.mock.contexts[0] as HTMLAnchorElement;
      expect(link.download).toStrictEqual("spring-5k-laps.csv");
      expect(link.href).toStrictEqual("blob:laps");
      const blob = createObjectURL.mock.calls[0][0] as Blob;
      // Both laps, even though the 5s filter collapses them into one count.
      expect(await blob.text()).toStrictEqual(
        [
          "timestamp,runner_id,runner_name",
          "2026-01-01T00:00:00.000Z,runner-1,Bib 42",
          "2026-01-01T00:00:03.000Z,runner-1,Bib 42",
        ].join("\r\n"),
      );
    });

    it("is disabled when there are no laps", async () => {
      const views = loadViews(
        render(() => (
          <TestContext api={{ races: { ":id": { laps: { $get: mockJSONRequest([]) } } } }}>
            <LapCounts race={testRace()} />
          </TestContext>
        )),
      );

      const lapCounts = await views.lapCounts();
      expect(lapCounts.exportButton.disabled).toBe(true);
    });
  });

  it("lays the counts out as a table with name, id and laps columns", async () => {
    const runner = "3f2a9c1e-0000-4000-8000-000000000042";
    const laps$get = mockJSONRequest([testLap({ runner, info: "Bib 42" })]);

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { ":id": { laps: { $get: laps$get } } } }}>
          <LapCounts race={testRace()} />
        </TestContext>
      )),
    );

    const lapCounts = await views.lapCounts();
    await waitFor(() => expect(lapCounts.items()).toHaveLength(1));
    expect(lapCounts.headers).toStrictEqual(["Name", "Runner ID", "Laps"]);
    // The cell shows a short id; the full one is in the tooltip.
    expect(lapCounts.text).toContain("3f2a9c1e");
    expect(lapCounts.text).not.toContain(runner);
    expect(lapCounts.items()).toStrictEqual([
      { name: "Bib 42", id: runner, count: 1 },
    ]);
  });
});
