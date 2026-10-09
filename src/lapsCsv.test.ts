import { describe, expect, it } from "vitest";
import { lapsCsv, lapsCsvFilename } from "./lapsCsv";
import { testLap, uuid } from "./test/fixtures";
import { deviceName } from "./deviceName";

describe("lapsCsv", () => {
  it("lists every lap oldest first, including ones the lap filter would collapse", () => {
    const csv = lapsCsv([
      testLap({ runner: "r2", timestamp: "2026-01-01T00:00:10.000Z", info: { name: "Jamie" } }),
      testLap({ runner: "r1", timestamp: "2026-01-01T00:00:00.000Z", info: "Bib 42" }),
      testLap({ runner: "r1", timestamp: "2026-01-01T00:00:01.000Z", info: "Bib 42" }),
    ]);
    expect(csv).toStrictEqual(
      [
        "timestamp,runner_id,runner_name,device_id,device_name",
        "2026-01-01T00:00:00.000Z,r1,Bib 42,,",
        "2026-01-01T00:00:01.000Z,r1,Bib 42,,",
        "2026-01-01T00:00:10.000Z,r2,Jamie,,",
      ].join("\r\n"),
    );
  });

  it("leaves the name blank when the runner has none", () => {
    expect(lapsCsv([testLap({ runner: "r1", info: { bib: 7 } })])).toStrictEqual(
      "timestamp,runner_id,runner_name,device_id,device_name\r\n1970-01-01T00:00:00.000Z,r1,,,",
    );
  });

  it("quotes names containing commas, quotes or newlines", () => {
    const csv = lapsCsv([testLap({ runner: "r1", info: 'Smith, "Jo"\nJr' })]);
    expect(csv.split("\r\n")[1]).toStrictEqual(
      '1970-01-01T00:00:00.000Z,r1,"Smith, ""Jo""\nJr",,',
    );
  });

  it("stops names from being read as spreadsheet formulas", () => {
    const csv = lapsCsv([testLap({ runner: "r1", info: "=1+1" })]);
    expect(csv.split("\r\n")[1]).toStrictEqual("1970-01-01T00:00:00.000Z,r1,'=1+1,,");
  });
});

describe("lapsCsv device columns", () => {
  it("names the device that scanned each lap, preferring its label", () => {
    const at = (s: number) => `2026-01-01T00:00:0${s}.000Z`;
    const csv = lapsCsv([
      testLap({ runner: "r1", timestamp: at(0), device: uuid(5), deviceLabel: "Finish line" }),
      testLap({ runner: "r1", timestamp: at(1), device: uuid(6) }),
      testLap({ runner: "r1", timestamp: at(2) }),
    ]);
    expect(csv.split("\r\n").slice(1)).toStrictEqual([
      `${at(0)},r1,,${uuid(5)},Finish line`,
      `${at(1)},r1,,${uuid(6)},${deviceName(uuid(6))}`,
      `${at(2)},r1,,,`,
    ]);
  });

  it("stops device labels from being read as spreadsheet formulas", () => {
    const csv = lapsCsv([
      testLap({ runner: "r1", device: uuid(5), deviceLabel: "@SUM(A1)" }),
    ]);
    expect(csv.split("\r\n")[1]).toStrictEqual(
      `1970-01-01T00:00:00.000Z,r1,,${uuid(5)},'@SUM(A1)`,
    );
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
