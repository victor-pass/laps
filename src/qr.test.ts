import { describe, expect, it } from "vitest";
import { raceQrData, parseRaceLink, parseJoinUrl, joinPath } from "./qr";
import { uuid } from "@/test/fixtures";

describe("raceQrData/parseRaceLink", () => {
  it("encodes a race as a join link carrying its name", () => {
    expect(
      raceQrData("https://laps.example", { id: uuid(1), name: "Spring 5k" }),
    ).toEqual(`https://laps.example/join/${uuid(1)}?name=Spring+5k`);
  });

  it("round-trips a race", () => {
    const race = { id: uuid(1), name: "Fun Run & Walk #2" };
    expect(parseRaceLink(raceQrData("https://laps.example", race))).toEqual(
      race,
    );
  });

  it("accepts join links from any origin", () => {
    expect(parseRaceLink(`http://localhost:5173/join/${uuid(1)}`)).toEqual({
      id: uuid(1),
    });
  });

  it("ignores a blank name", () => {
    expect(
      parseRaceLink(`https://laps.example/join/${uuid(1)}?name=%20`),
    ).toEqual({ id: uuid(1) });
  });

  it("returns undefined for data that isn't a race", () => {
    expect(parseRaceLink(uuid(1))).toBeUndefined();
    expect(parseRaceLink("Bib 42")).toBeUndefined();
    expect(parseRaceLink('{"name":"Jamie"}')).toBeUndefined();
    expect(parseRaceLink("https://laps.example/share")).toBeUndefined();
    expect(parseRaceLink("https://laps.example/join/abc-123")).toBeUndefined();
    expect(
      parseRaceLink(`https://laps.example/join/${uuid(1)}/extra`),
    ).toBeUndefined();
    expect(
      parseRaceLink(`ftp://laps.example/join/${uuid(1)}`),
    ).toBeUndefined();
  });
});

describe("joinPath/parseJoinUrl", () => {
  it("builds a same-site path, with or without a name", () => {
    expect(joinPath({ id: uuid(1) })).toEqual(`/join/${uuid(1)}`);
    expect(joinPath({ id: uuid(1), name: "a/b?c" })).toEqual(
      `/join/${uuid(1)}?name=a%2Fb%3Fc`,
    );
  });

  it("only matches join paths", () => {
    const parse = (path: string) =>
      parseJoinUrl(new URL(path, "https://laps.example"));
    expect(parse(`/join/${uuid(1)}`)).toEqual({ id: uuid(1) });
    expect(parse("/summary")).toBeUndefined();
  });
});
