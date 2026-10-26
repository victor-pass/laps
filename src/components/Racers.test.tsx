import { afterEach, expect, describe, it, vi } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { Racers } from "./Racers";
import { TestContext, ApiOverrides, offlineApi } from "@/test/TestContext";
import { mockJSONRequest, testRace, uuid } from "@/test/fixtures";
import { loadViews } from "@/test/Views/";
import type { RacerData } from "@/api";

function testRacer(overrides: Partial<RacerData> = {}): RacerData {
  return { ref: uuid(10), info: null, name: null, laps: 0, ...overrides };
}

const race = testRace({ id: uuid(1), name: "Spring 5k" });

function renderRacers(api: ApiOverrides["races"] = {}) {
  return loadViews(
    render(() => (
      <TestContext
        api={{
          races: { selected: { $get: mockJSONRequest(race) }, ...api },
        }}
      >
        <Racers />
      </TestContext>
    )),
  );
}

describe("Racers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists the race's racers, named first, with what their QR scans to", async () => {
    const $get = mockJSONRequest([
      testRacer({ ref: uuid(12), info: "bib:42", laps: 3 }),
      testRacer({ ref: uuid(11), name: "Sam" }),
      testRacer({ ref: uuid(13), name: "Alex", info: "bib:7", laps: 1 }),
    ]);

    const views = renderRacers({ ":id": { runners: { $get } } });

    const racers = await views.racers();
    await waitFor(() =>
      expect(racers.items()).toStrictEqual([
        { name: "Alex", qrData: "bib:7", laps: 1, removable: false },
        // Unnamed, but sorted by its scanned text
        { name: "", qrData: "bib:42", laps: 3, removable: false },
        { name: "Sam", qrData: uuid(11), laps: 0, removable: true },
      ]),
    );
    expect($get).toHaveBeenCalledWith({ param: { id: uuid(1) } });
  });

  it("adds a racer per line", async () => {
    const $post = mockJSONRequest([
      testRacer({ ref: uuid(11), name: "Sam" }),
      testRacer({ ref: uuid(12), name: "Alex" }),
    ]);

    const views = renderRacers({ ":id": { runners: { $post } } });
    const racers = await views.racers();
    await waitFor(() => expect(racers.text).toContain("No racers yet"));
    racers.addRacers("Sam\n\n  Alex \n");

    await waitFor(() =>
      expect(racers.items().map((r) => r.name)).toStrictEqual(["Alex", "Sam"]),
    );
    expect($post).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(1) },
      json: { names: ["Sam", "Alex"] },
    });
  });

  it("renames a racer", async () => {
    const $patch = mockJSONRequest(testRacer({ name: "Jo" }));

    const views = renderRacers({
      ":id": {
        runners: {
          $get: mockJSONRequest([testRacer({ name: "Sam" })]),
          ":ref": { $patch },
        },
      },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.items()).toHaveLength(1));
    racers.rename(0, "Jo");

    await waitFor(() => expect(racers.items()[0].name).toBe("Jo"));
    expect($patch).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(1), ref: uuid(10) },
      json: { name: "Jo" },
    });
  });

  it("removes a racer", async () => {
    const $delete = mockJSONRequest({ ok: true });

    const views = renderRacers({
      ":id": {
        runners: {
          $get: mockJSONRequest([
            testRacer({ ref: uuid(11), name: "Alex" }),
            testRacer({ ref: uuid(12), name: "Sam" }),
          ]),
          ":ref": { $delete },
        },
      },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.items()).toHaveLength(2));
    racers.remove(0);

    await waitFor(() =>
      expect(racers.items().map((r) => r.name)).toStrictEqual(["Sam"]),
    );
    expect($delete).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(1), ref: uuid(11) },
    });
  });

  it("prints a lanyard badge for every racer, with only their id or original code in the QR", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const views = renderRacers({
      ":id": {
        runners: {
          $get: mockJSONRequest([
            testRacer({ ref: uuid(11), name: "Sam" }),
            testRacer({ ref: uuid(12), info: "bib:42" }),
          ]),
        },
      },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.items()).toHaveLength(2));

    racers.printAll();

    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    const sheet = await views.printSheet();
    expect(sheet.format).toBe("print-badge");
    expect(await sheet.cards()).toStrictEqual([
      { race: "Spring 5k", name: "bib:42", scansTo: "bib:42" },
      { race: "Spring 5k", name: "Sam", scansTo: uuid(11) },
    ]);
  });

  it("reprints just the selected racers on A4", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const views = renderRacers({
      ":id": {
        runners: {
          $get: mockJSONRequest([
            testRacer({ ref: uuid(11), name: "Alex" }),
            testRacer({ ref: uuid(12), name: "Sam" }),
            testRacer({ ref: uuid(13), name: "Kim" }),
          ]),
        },
      },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.items()).toHaveLength(3));

    racers.select(0);
    racers.select(2);
    racers.setFormat("a4");
    expect(racers.printSelectedLabel).toBe("Print selected (2)");
    racers.printSelected();

    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    const sheet = await views.printSheet();
    expect(sheet.format).toBe("print-a4");
    expect((await sheet.cards()).map((c) => c.scansTo)).toStrictEqual([
      uuid(11),
      uuid(12),
    ]);
  });

  it("says racers need a connection when the server can't be reached", async () => {
    const views = renderRacers({
      ...offlineApi().races,
      selected: { $get: mockJSONRequest(race) },
    });

    const racers = await views.racers();
    await waitFor(() =>
      expect(racers.text).toContain("Racers need a connection."),
    );
  });
});
