import { describe, expect, it } from "vitest";
import { lapsCsv, lapsCsvFilename } from "./lapsCsv";
import { testLap } from "./test/fixtures";

describe("lapsCsv", () => {
  it("lists every lap oldest first, including ones the lap filter would collapse", () => {
    const csv = lapsCsv([
      testLap({ runner: "r2", timestamp: "2026-01-01T00:00:10.000Z", info: { name: "Jamie" } }),
      testLap({ runner: "r1", timestamp: "2026-01-01T00:00:00.000Z", info: "Bib 42" }),
      testLap({ runner: "r1", timestamp: "2026-01-01T00:00:01.000Z", info: "Bib 42" }),
    ]);
    expect(csv).toStrictEqual(
      [
        "timestamp,runner_id,runner_name",
        "2026-01-01T00:00:00.000Z,r1,Bib 42",
        "2026-01-01T00:00:01.000Z,r1,Bib 42",
        "2026-01-01T00:00:10.000Z,r2,Jamie",
      ].join("\r\n"),
    );
  });

  it("leaves the name blank when the runner has none", () => {
    expect(lapsCsv([testLap({ runner: "r1", info: { bib: 7 } })])).toStrictEqual(
      "timestamp,runner_id,runner_name\r\n1970-01-01T00:00:00.000Z,r1,",
    );
  });

  it("quotes names containing commas, quotes or newlines", () => {
    const csv = lapsCsv([testLap({ runner: "r1", info: 'Smith, "Jo"\nJr' })]);
    expect(csv.split("\r\n")[1]).toStrictEqual(
      '1970-01-01T00:00:00.000Z,r1,"Smith, ""Jo""\nJr"',
    );
  });

  it("stops names from being read as spreadsheet formulas", () => {
    const csv = lapsCsv([testLap({ runner: "r1", info: "=1+1" })]);
    expect(csv.split("\r\n")[1]).toStrictEqual("1970-01-01T00:00:00.000Z,r1,'=1+1");
  });
});

describe("lapsCsvFilename", () => {
  it("slugs the race name", () => {
    expect(lapsCsvFilename("Spring 5k / Heat #2")).toStrictEqual("spring-5k-heat-2-laps.csv");
  });

  it("falls back when the name has no usable characters", () => {
    expect(lapsCsvFilename("🏃")).toStrictEqual("race-laps.csv");
  });
});
