import { describe, expect, it } from "vitest";
import { groupCsv, lapsCsv, lapsCsvFilename, racersCsv } from "./lapsCsv";
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
        "timestamp,runner_id,runner_name,device_id,device_name,user",
        "2026-01-01T00:00:00.000Z,r1,Bib 42,,,",
        "2026-01-01T00:00:01.000Z,r1,Bib 42,,,",
        "2026-01-01T00:00:10.000Z,r2,Jamie,,,",
      ].join("\r\n"),
    );
  });

  it("leaves the name blank when the runner has none", () => {
    expect(lapsCsv([testLap({ runner: "r1", info: { bib: 7 } })])).toStrictEqual(
      "timestamp,runner_id,runner_name,device_id,device_name,user\r\n1970-01-01T00:00:00.000Z,r1,,,,",
    );
  });

  it("quotes names containing commas, quotes or newlines", () => {
    const csv = lapsCsv([testLap({ runner: "r1", info: 'Smith, "Jo"\nJr' })]);
    expect(csv.split("\r\n")[1]).toStrictEqual(
      '1970-01-01T00:00:00.000Z,r1,"Smith, ""Jo""\nJr",,,',
    );
  });

  it("stops names from being read as spreadsheet formulas", () => {
    const csv = lapsCsv([testLap({ runner: "r1", info: "=1+1" })]);
    expect(csv.split("\r\n")[1]).toStrictEqual("1970-01-01T00:00:00.000Z,r1,'=1+1,,,");
  });
});

describe("lapsCsv device columns", () => {
  it("names the device that scanned each lap, preferring its label, and its user", () => {
    const at = (s: number) => `2026-01-01T00:00:0${s}.000Z`;
    const csv = lapsCsv([
      testLap({ runner: "r1", timestamp: at(0), device: uuid(5), deviceLabel: "Finish line", userName: "Stephen" }),
      testLap({ runner: "r1", timestamp: at(1), device: uuid(6) }),
      testLap({ runner: "r1", timestamp: at(2) }),
    ]);
    expect(csv.split("\r\n").slice(1)).toStrictEqual([
      `${at(0)},r1,,${uuid(5)},Finish line,Stephen`,
      `${at(1)},r1,,${uuid(6)},${deviceName(uuid(6))},`,
      `${at(2)},r1,,,,`,
    ]);
  });

  it("stops user names from being read as spreadsheet formulas", () => {
    const csv = lapsCsv([
      testLap({ runner: "r1", device: uuid(5), userName: "+Jo" }),
    ]);
    expect(csv.split("\r\n")[1]).toStrictEqual(
      `1970-01-01T00:00:00.000Z,r1,,${uuid(5)},${deviceName(uuid(5))},'+Jo`,
    );
  });

  it("stops device labels from being read as spreadsheet formulas", () => {
    const csv = lapsCsv([
      testLap({ runner: "r1", device: uuid(5), deviceLabel: "@SUM(A1)" }),
    ]);
    expect(csv.split("\r\n")[1]).toStrictEqual(
      `1970-01-01T00:00:00.000Z,r1,,${uuid(5)},'@SUM(A1),`,
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

describe("group reports", () => {
  const racer = (ref: string, name: string, details: Record<string, string>) => ({
    ref,
    name,
    info: null,
    details,
  });
  const racers = [
    racer("r1", "Sam", { teacher: "Lee", grade: "3" }),
    racer("r2", "Alex", { teacher: "Ng", grade: "10" }),
    racer("r3", "Kim", { teacher: "Lee", grade: "2" }),
    racer("r4", "Jo", {}),
  ];
  const at = (runner: string, time: string) =>
    testLap({ runner, timestamp: `2026-01-01T${time}.000Z` });
  const laps = [
    at("r1", "09:00:00"),
    at("r1", "09:00:02"), // within 5s - collapsed
    at("r1", "09:10:00"),
    at("r2", "09:05:00"),
    at("r4", "09:06:00"),
    at("r3", "10:30:00"), // after the window
  ];
  const window = {
    from: new Date("2026-01-01T09:00:00Z"),
    to: new Date("2026-01-01T09:59:59Z"),
    filterSeconds: 5,
  };

  it("totals laps per group in the window, with racers who have none", () => {
    expect(groupCsv(racers, laps, { ...window, groupBy: "teacher" })).toStrictEqual(
      [
        "teacher,racers,laps,average_laps",
        "Lee,2,2,1",
        "Ng,1,1,1",
        "(none),1,1,1",
        "Total,4,4,1",
      ].join("\r\n"),
    );
  });

  it("lists racers with every detail, sorted by group in number order", () => {
    expect(racersCsv(racers, laps, { filterSeconds: 5, groupBy: "grade" })).toStrictEqual(
      [
        "name,runner_id,grade,teacher,laps",
        "Kim,r3,2,Lee,1",
        "Sam,r1,3,Lee,2",
        "Alex,r2,10,Ng,1",
        "Jo,r4,,,1",
      ].join("\r\n"),
    );
  });

  it("adds distance columns in the race's unit when it has a lap distance", () => {
    const distance = { perLap: 0.4, unit: "km" } as const;
    expect(
      groupCsv(racers, laps, { ...window, groupBy: "teacher", distance }),
    ).toStrictEqual(
      [
        "teacher,racers,laps,average_laps,distance_km,average_distance_km",
        "Lee,2,2,1,0.8,0.4",
        "Ng,1,1,1,0.4,0.4",
        "(none),1,1,1,0.4,0.4",
        "Total,4,4,1,1.6,0.4",
      ].join("\r\n"),
    );
    expect(
      racersCsv(racers, laps, { filterSeconds: 5, groupBy: "", distance }),
    ).toStrictEqual(
      [
        "name,runner_id,grade,teacher,laps,distance_km",
        "Alex,r2,10,Ng,1,0.4",
        "Jo,r4,,,1,0.4",
        "Kim,r3,2,Lee,1,0.4",
        "Sam,r1,3,Lee,2,0.8",
      ].join("\r\n"),
    );
  });

  it("names report files after the race and grouping", () => {
    expect(lapsCsvFilename("Spring 5k", "by-teacher")).toStrictEqual(
      "spring-5k-by-teacher.csv",
    );
  });
});
