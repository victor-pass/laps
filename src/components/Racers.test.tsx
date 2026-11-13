import { afterEach, expect, describe, it, vi } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { Racers } from "./Racers";
import { TestContext, ApiOverrides, offlineApi } from "@/test/TestContext";
import { mockJSONRequest, testLap, testRace, uuid } from "@/test/fixtures";
import { loadViews } from "@/test/Views/";
import type { RacerData } from "@/api";

// Each downloaded file's name and contents, in order.
function spyDownloads() {
  const createObjectURL = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:download");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  return {
    files: () =>
      Promise.all(
        click.mock.contexts.map(async (link, i) => ({
          name: (link as HTMLAnchorElement).download,
          text: await (createObjectURL.mock.calls[i][0] as Blob).text(),
        })),
      ),
  };
}

function testRacer(overrides: Partial<RacerData> = {}): RacerData {
  return {
    ref: uuid(10),
    info: null,
    name: null,
    details: {},
    laps: 0,
    ...overrides,
  };
}

// `count` laps by one racer, a minute apart so none are repeats.
const lapsBy = (ref: string, count: number) =>
  Array.from({ length: count }, (_, i) =>
    testLap({ runner: ref, timestamp: new Date(i * 60_000).toISOString() }),
  );

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

  it("lists the race's racers, named first", async () => {
    const $get = mockJSONRequest([
      testRacer({ ref: uuid(12), info: "bib:42", laps: 3 }),
      testRacer({ ref: uuid(11), name: "Sam" }),
      testRacer({ ref: uuid(13), name: "Alex", info: "bib:7", laps: 1 }),
    ]);

    const laps = [...lapsBy(uuid(12), 3), ...lapsBy(uuid(13), 1)];

    const views = renderRacers({
      ":id": { runners: { $get }, laps: { $get: mockJSONRequest(laps) } },
    });

    const racers = await views.racers();
    await waitFor(() =>
      expect(racers.items()).toStrictEqual([
        { name: "Alex", placeholder: "bib:7", laps: 1 },
        // Unnamed: shows and sorts by its scanned text
        { name: "", placeholder: "bib:42", laps: 3 },
        { name: "Sam", placeholder: "—", laps: 0 },
      ]),
    );
    expect($get).toHaveBeenCalledWith({ param: { id: uuid(1) } });
  });

  it("adds a racer per line pasted without a header", async () => {
    const $post = mockJSONRequest([
      testRacer({ ref: uuid(11), name: "Sam" }),
      testRacer({ ref: uuid(12), name: "Alex" }),
    ]);

    const views = renderRacers({
      ":id": { runners: { $get: mockJSONRequest([]), import: { $post } } },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.text).toContain("No racers yet"));
    racers.pasteImport("Sam\n\n  Alex \n");

    expect(racers.importPreview).toStrictEqual({
      columns: "No header row: one name per line",
      summary: "0 to update, 2 new: Sam, Alex",
      skipped: [],
    });
    racers.runImport();

    await waitFor(() =>
      expect(racers.items().map((r) => r.name)).toStrictEqual(["Alex", "Sam"]),
    );
    expect($post).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(1) },
      json: {
        updated: [],
        added: [
          { name: "Sam", details: {} },
          { name: "Alex", details: {} },
        ],
      },
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

  it("removes a selected racer", async () => {
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
    racers.select(0);
    racers.removeSelected();

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

    expect(racers.printLabel).toBe("Print 2 QR codes");
    racers.print();

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
    expect(racers.selectedCount).toBe("2 selected");
    expect(racers.printLabel).toBe("Print 2 QR codes");
    racers.print();

    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    const sheet = await views.printSheet();
    expect(sheet.format).toBe("print-a4");
    expect((await sheet.cards()).map((c) => c.scansTo)).toStrictEqual([
      uuid(11),
      uuid(12),
    ]);
  });

  it("shows a column per detail and saves an edited one", async () => {
    const $patch = mockJSONRequest(
      testRacer({ ref: uuid(11), name: "Sam", details: { grade: "4" } }),
    );
    const views = renderRacers({
      ":id": {
        runners: {
          $get: mockJSONRequest([
            testRacer({ ref: uuid(11), name: "Sam", details: { grade: "3", teacher: "Lee" } }),
            testRacer({ ref: uuid(12), name: "Alex" }),
          ]),
          ":ref": { $patch },
        },
      },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.items()).toHaveLength(2));
    expect(racers.detailHeaders).toStrictEqual(["grade", "teacher"]);
    expect(racers.details()).toStrictEqual([
      { grade: "", teacher: "" },
      { grade: "3", teacher: "Lee" },
    ]);

    racers.setDetail(1, "grade", "4");

    await waitFor(() =>
      expect(racers.details()[1]).toStrictEqual({ grade: "4" }),
    );
    expect($patch).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(1), ref: uuid(11) },
      json: { details: { grade: "4" } },
    });
  });

  it("adds a blank column from the header and saves a value in it", async () => {
    const $patch = mockJSONRequest(
      testRacer({ ref: uuid(11), name: "Sam", details: { class: "5B" } }),
    );
    const views = renderRacers({
      ":id": {
        runners: {
          $get: mockJSONRequest([testRacer({ ref: uuid(11), name: "Sam" })]),
          ":ref": { $patch },
        },
      },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.items()).toHaveLength(1));
    expect(racers.detailHeaders).toStrictEqual([]);

    racers.addColumn(" class ");
    expect(racers.detailHeaders).toStrictEqual(["class"]);
    expect(racers.details()).toStrictEqual([{ class: "" }]);

    racers.setDetail(0, "class", "5B");
    await waitFor(() =>
      expect(racers.details()).toStrictEqual([{ class: "5B" }]),
    );
    expect($patch).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(1), ref: uuid(11) },
      json: { details: { class: "5B" } },
    });
  });

  it("previews a pasted upload, then sends just the changes", async () => {
    const $post = mockJSONRequest([
      testRacer({ ref: uuid(11), name: "Sam", details: { grade: "4" } }),
      testRacer({ ref: uuid(12), name: "Kim", details: { grade: "2" } }),
    ]);
    const views = renderRacers({
      ":id": {
        runners: {
          $get: mockJSONRequest([
            testRacer({ ref: uuid(11), name: "Sam", details: { grade: "3" } }),
          ]),
          import: { $post },
        },
      },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.items()).toHaveLength(1));

    racers.pasteImport("name\tgrade\nSam\t4\nKim\t2\n\t5");

    expect(racers.importPreview).toStrictEqual({
      columns: "Details: grade",
      summary: "1 to update, 1 new: Kim",
      skipped: ["Line 4 skipped: no name"],
    });
    racers.runImport();

    await waitFor(() =>
      expect(racers.items().map((r) => r.name)).toStrictEqual(["Kim", "Sam"]),
    );
    expect($post).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(1) },
      json: {
        updated: [{ ref: uuid(11), details: { grade: "4" } }],
        added: [{ name: "Kim", details: { grade: "2" } }],
      },
    });
    expect(racers.importPreview).toBeNull();
  });

  it("downloads the racer info to fill in and upload back", async () => {
    const { files } = spyDownloads();
    const views = renderRacers({
      ":id": {
        runners: {
          $get: mockJSONRequest([
            testRacer({ ref: uuid(11), name: "Sam", details: { grade: "3" } }),
            testRacer({ ref: uuid(12), info: "bib:42" }),
          ]),
        },
      },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.items()).toHaveLength(2));

    expect(racers.downloadScope).toBe("All racers (2)");
    racers.downloadRacerInfo();

    expect(await files()).toStrictEqual([
      {
        name: "spring-5k-racers.csv",
        text: [
          "name,runner_id,grade",
          `bib:42,${uuid(12)},`,
          `Sam,${uuid(11)},3`,
        ].join("\r\n"),
      },
    ]);
  });

  describe("race data downloads", () => {
    // Local times, as the window inputs are.
    const local = (time: string) =>
      new Date(`2026-01-01T${time}`).toISOString();
    const laps = [
      testLap({ runner: uuid(11), timestamp: local("09:00:00"), info: "Sam" }),
      testLap({ runner: uuid(11), timestamp: local("09:30:40"), info: "Sam" }),
      testLap({ runner: uuid(12), timestamp: local("09:31:00"), info: "Kim" }),
    ];
    const runners = [
      testRacer({ ref: uuid(11), name: "Sam", laps: 2, details: { grade: "3", teacher: "Lee" } }),
      testRacer({ ref: uuid(12), name: "Kim", laps: 1, details: { grade: "3" } }),
    ];
    const renderWithLaps = async () => {
      const views = renderRacers({
        ":id": {
          laps: { $get: mockJSONRequest(laps) },
          runners: { $get: mockJSONRequest(runners) },
        },
      });
      const racers = await views.racers();
      await waitFor(() => expect(racers.items()).toHaveLength(2));
      await waitFor(() =>
        expect(racers.downloadLapsButton.disabled).toBe(false),
      );
      return racers;
    };

    it("downloads flat and grouped race data over a window of the race", async () => {
      const { files } = spyDownloads();
      const racers = await renderWithLaps();

      expect(racers.groupByOptions).toStrictEqual(["grade", "teacher"]);
      racers.groupBy("teacher");
      // "To 09:30" includes the whole minute.
      racers.setWindow("2026-01-01T09:00", "2026-01-01T09:30");
      racers.downloadFlat();
      racers.downloadGroups();

      expect(await files()).toStrictEqual([
        {
          name: "spring-5k-race-data.csv",
          text: [
            "name,runner_id,grade,teacher,laps",
            `Kim,${uuid(12)},3,,0`,
            `Sam,${uuid(11)},3,Lee,2`,
          ].join("\r\n"),
        },
        {
          name: "spring-5k-by-teacher.csv",
          text: [
            "teacher,racers,laps,average_laps",
            "Lee,1,2,2",
            "(none),1,0,0",
            "Total,2,2,1",
          ].join("\r\n"),
        },
      ]);
    });

    it("adds distance to the downloads once a lap distance is set", async () => {
      const { files } = spyDownloads();
      const racers = await renderWithLaps();
      expect(racers.lapDistance).toBe("");
      expect(racers.distanceUnit).toBe("km");
      expect(racers.distanceHeader).toBeUndefined();
      expect(racers.distances()).toStrictEqual([undefined, undefined]);

      racers.commitLapDistance("0.25");
      racers.chooseDistanceUnit("mi");
      // Kim, Sam: the table's distance column follows the setting.
      expect(racers.distanceHeader).toBe("mi");
      expect(racers.distances()).toStrictEqual(["0.25", "0.5"]);
      racers.groupBy("teacher");
      racers.downloadFlat();
      racers.downloadGroups();

      expect(await files()).toStrictEqual([
        {
          name: "spring-5k-race-data.csv",
          text: [
            "name,runner_id,grade,teacher,laps,distance_mi",
            `Kim,${uuid(12)},3,,1,0.25`,
            `Sam,${uuid(11)},3,Lee,2,0.5`,
          ].join("\r\n"),
        },
        {
          name: "spring-5k-by-teacher.csv",
          text: [
            "teacher,racers,laps,average_laps,distance_mi,average_distance_mi",
            "Lee,1,2,2,0.5,0.5",
            "(none),1,1,1,0.25,0.25",
            "Total,2,3,1.5,0.75,0.38",
          ].join("\r\n"),
        },
      ]);
    });

    it("saves the lap distance for every device, and clears it when blanked", async () => {
      const $patch = mockJSONRequest(null);
      const views = renderRacers({
        ":id": {
          $patch,
          laps: { $get: mockJSONRequest([]) },
          runners: { $get: mockJSONRequest([]) },
        },
      });
      const racers = await views.racers();
      await waitFor(() => expect(racers.distanceUnit).toBe("km"));

      racers.commitLapDistance("400");
      racers.chooseDistanceUnit("m");
      await waitFor(() =>
        expect($patch).toHaveBeenCalledWith({
          param: { id: uuid(1) },
          json: { lapDistance: 400, distanceUnit: "m" },
        }),
      );

      racers.commitLapDistance("");
      await waitFor(() =>
        expect($patch).toHaveBeenLastCalledWith({
          param: { id: uuid(1) },
          json: { lapDistance: null },
        }),
      );

      // Not a distance: put back, nothing sent.
      const calls = $patch.mock.calls.length;
      racers.commitLapDistance("-3");
      expect(racers.lapDistance).toBe("");
      expect($patch).toHaveBeenCalledTimes(calls);
    });

    it("downloads every lap of just the selected racers", async () => {
      const { files } = spyDownloads();
      const racers = await renderWithLaps();

      racers.select(1); // Sam
      expect(racers.downloadScope).toBe("Selected racers (1)");
      racers.downloadLaps();

      expect(await files()).toStrictEqual([
        {
          name: "spring-5k-laps.csv",
          // Both laps, though they're closer than the race's lap filter.
          text: [
            "timestamp,runner_id,runner_name,device_id,device_name,user",
            `${local("09:00:00")},${uuid(11)},Sam,,,`,
            `${local("09:30:40")},${uuid(11)},Sam,,,`,
          ].join("\r\n"),
        },
      ]);
    });
  });

  it("filters the racers by name or detail, and acts on those shown", async () => {
    const views = renderRacers({
      ":id": {
        runners: {
          $get: mockJSONRequest([
            testRacer({ ref: uuid(11), name: "Sam", details: { teacher: "Lee" } }),
            testRacer({ ref: uuid(12), name: "Kim", details: { teacher: "Ng" } }),
            testRacer({ ref: uuid(13), name: "Lee" }),
          ]),
        },
      },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.items()).toHaveLength(3));

    racers.filter("lee");
    expect(racers.items().map((r) => r.name)).toStrictEqual(["Lee", "Sam"]);
    expect(racers.printLabel).toBe("Print 2 QR codes");
    expect(racers.downloadScope).toBe("Shown racers (2)");

    racers.filter("zz");
    expect(racers.text).toContain("No racers match");
  });

  it("sorts by a column, numbers in order, blanks last", async () => {
    const views = renderRacers({
      ":id": {
        runners: {
          $get: mockJSONRequest([
            testRacer({ ref: uuid(11), name: "Sam", laps: 1, details: { grade: "10" } }),
            testRacer({ ref: uuid(12), name: "Kim", laps: 4, details: { grade: "2" } }),
            testRacer({ ref: uuid(13), name: "Alex", laps: 2 }),
          ]),
        },
        laps: {
          $get: mockJSONRequest([
            ...lapsBy(uuid(11), 1),
            ...lapsBy(uuid(12), 4),
            ...lapsBy(uuid(13), 2),
          ]),
        },
      },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.items()).toHaveLength(3));
    const names = () => racers.items().map((r) => r.name);
    expect(racers.sortedBy).toStrictEqual(["name", "ascending"]);

    racers.sortBy("grade");
    expect(names()).toStrictEqual(["Kim", "Sam", "Alex"]);
    racers.sortBy("grade");
    expect(racers.sortedBy).toStrictEqual(["grade", "descending"]);
    expect(names()).toStrictEqual(["Sam", "Kim", "Alex"]);

    racers.sortBy("laps");
    expect(names()).toStrictEqual(["Sam", "Alex", "Kim"]);
  });

  it("counts laps after the repeat-scan filter, which is set here", async () => {
    const $patch = mockJSONRequest(null);
    const views = renderRacers({
      ":id": {
        $patch,
        runners: {
          $get: mockJSONRequest([testRacer({ ref: uuid(11), name: "Sam", laps: 3 })]),
        },
        laps: {
          $get: mockJSONRequest([
            testLap({ runner: uuid(11), timestamp: "2026-01-01T00:00:00.000Z" }),
            testLap({ runner: uuid(11), timestamp: "2026-01-01T00:00:03.000Z" }),
            testLap({ runner: uuid(11), timestamp: "2026-01-01T00:00:10.000Z" }),
          ]),
        },
      },
    });
    const racers = await views.racers();
    // The 3s rescan doesn't count; the server's 3 is every scan.
    await waitFor(() => expect(racers.items()[0]?.laps).toBe(2));
    expect(racers.repeatFilter).toBe("5");

    racers.setRepeatFilter("2");
    expect(racers.items()[0].laps).toBe(3);
    expect($patch).not.toHaveBeenCalled();

    racers.commitRepeatFilter("8");
    expect(racers.items()[0].laps).toBe(2);
    await waitFor(() =>
      expect($patch).toHaveBeenCalledExactlyOnceWith({
        param: { id: uuid(1) },
        json: { lapFilterSeconds: 8 },
      }),
    );
  });

  it("shows the server's lap count when the laps can't be fetched", async () => {
    const views = renderRacers({
      ":id": {
        runners: {
          $get: mockJSONRequest([testRacer({ ref: uuid(11), name: "Sam", laps: 3 })]),
        },
        laps: { $get: vi.fn().mockRejectedValue(new TypeError("offline")) },
      },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.items()[0]?.laps).toBe(3));
  });

  it("removes the selected racers that have no laps", async () => {
    const $delete = mockJSONRequest({ ok: true });
    const views = renderRacers({
      ":id": {
        runners: {
          $get: mockJSONRequest([
            testRacer({ ref: uuid(11), name: "Alex" }),
            testRacer({ ref: uuid(12), name: "Sam", laps: 3 }),
            testRacer({ ref: uuid(13), name: "Kim" }),
          ]),
          ":ref": { $delete },
        },
      },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.items()).toHaveLength(3));

    racers.selectAll();
    expect(racers.removeSelectedLabel).toBe("Remove (2)");
    racers.removeSelected();

    await waitFor(() =>
      expect(racers.items().map((r) => r.name)).toStrictEqual(["Sam"]),
    );
    expect($delete).toHaveBeenCalledTimes(2);
    expect(racers.selectedCount).toBe("1 selected");
    racers.clearSelection();
    expect(racers.selectedCount).toBeNull();
  });

  it("keeps the add panel closed until asked for", async () => {
    const views = renderRacers({
      ":id": { runners: { $get: mockJSONRequest([]) } },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.text).toContain("No racers yet"));
    expect(racers.importOpen).toBe(false);

    racers.pasteImport("Sam");
    expect(racers.importOpen).toBe(true);
  });

  it("previews an uploaded file", async () => {
    const views = renderRacers({
      ":id": { runners: { $get: mockJSONRequest([]) } },
    });
    const racers = await views.racers();
    await waitFor(() => expect(racers.text).toContain("No racers yet"));

    racers.chooseImportFile(
      new File(["name,teacher\nSam,Lee\n"], "class.csv", { type: "text/csv" }),
    );

    await waitFor(() =>
      expect(racers.importPreview?.summary).toBe("0 to update, 1 new: Sam"),
    );
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
