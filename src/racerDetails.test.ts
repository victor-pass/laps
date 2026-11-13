import { describe, expect, it } from "vitest";
import {
  cleanDetails,
  detailKeys,
  mergeDetails,
  parseTable,
  planImport,
} from "@/racerDetails";
import { racerTemplateCsv } from "@/lapsCsv";
import { uuid } from "@/test/fixtures";

const racer = (
  ref: string,
  name: string | null,
  details: Record<string, string> = {},
  info: unknown = null,
) => ({ ref, name, info, details });

describe("parseTable", () => {
  it("reads quoted CSV cells, CRLF, and skips blank lines", () => {
    expect(
      parseTable('name,note\r\n"Lee, Sam","said ""hi"""\r\n\r\nKim,\n'),
    ).toStrictEqual([
      ["name", "note"],
      ["Lee, Sam", 'said "hi"'],
      ["Kim", ""],
    ]);
  });

  it("reads tab-separated text pasted from a spreadsheet", () => {
    expect(parseTable("name\tgrade\nSam\t3")).toStrictEqual([
      ["name", "grade"],
      ["Sam", "3"],
    ]);
  });
});

describe("details", () => {
  it("cleans to trimmed, non-blank strings", () => {
    expect(
      cleanDetails({ " grade ": " 3 ", house: "", n: 4, x: null }),
    ).toStrictEqual({ grade: "3", n: "4" });
    expect(cleanDetails(["a"])).toStrictEqual({});
  });

  it("merges an edit, removing blanked ones and keeping the rest", () => {
    expect(
      mergeDetails({ grade: "3", house: "Red" }, { grade: "", teacher: "Lee" }),
    ).toStrictEqual({ house: "Red", teacher: "Lee" });
  });

  it("lists every racer's detail names", () => {
    expect(
      detailKeys([{ details: { grade: "3" } }, { details: { house: "Red", grade: "4" } }, {}]),
    ).toStrictEqual(["grade", "house"]);
  });
});

describe("planImport", () => {
  const racers = [
    racer(uuid(1), "Sam", { teacher: "Ms Lee", grade: "3" }),
    racer(uuid(2), null, {}, "Alex"),
    racer(uuid(3), "Jo"),
    racer(uuid(4), "Jo"),
  ];

  it("matches names ignoring case, keeps values for blank cells, and adds unknown names", () => {
    const plan = planImport(
      "Name,Teacher,Grade\nsam,,4\nALEX,Mr Ng,\nKim,Mr Ng,2\nkim,,3\n",
      racers,
    );

    expect(plan.columns).toStrictEqual(["Teacher", "Grade"]);
    expect(plan.updated).toStrictEqual([
      // Blank teacher left out, so Ms Lee stays.
      { ref: uuid(1), details: { Grade: "4" } },
      // Matched by their scanned name.
      { ref: uuid(2), details: { Teacher: "Mr Ng" } },
    ]);
    // Two rows for the same new name merge into one racer.
    expect(plan.added).toStrictEqual([
      { name: "Kim", details: { Teacher: "Mr Ng", Grade: "3" } },
    ]);
    expect(plan.skipped).toStrictEqual([]);
  });

  it("matches by runner_id first, renaming, and skips rows it can't place", () => {
    const plan = planImport(
      [
        "runner_id,name,grade",
        `${uuid(3).toUpperCase()},Joanne,5`,
        ",Jo,6",
        `${uuid(9)},Zed,1`,
        ",,7",
      ].join("\n"),
      racers,
    );

    expect(plan.updated).toStrictEqual([
      { ref: uuid(3), name: "Joanne", details: { grade: "5" } },
    ]);
    expect(plan.added).toStrictEqual([]);
    expect(plan.skipped).toStrictEqual([
      { line: 3, reason: "2 racers are named Jo; add a runner_id" },
      { line: 4, reason: `unknown runner_id ${uuid(9)}` },
      { line: 5, reason: "no name" },
    ]);
  });

  it("leaves out rows that change nothing", () => {
    const plan = planImport("name,grade\nSam,3", racers);
    expect(plan.updated).toStrictEqual([]);
  });

  it("finds nothing to change in a re-uploaded template", () => {
    expect(planImport(racerTemplateCsv(racers), racers)).toStrictEqual({
      headerless: false,
      columns: ["grade", "teacher"],
      updated: [],
      added: [],
      skipped: [],
    });
  });

  it("applies what was filled into a template", () => {
    const filled = racerTemplateCsv(racers).replace(
      `Alex,${uuid(2)},,`,
      `Alex,${uuid(2)},5,Mr Ng`,
    );
    expect(planImport(filled, racers).updated).toStrictEqual([
      { ref: uuid(2), details: { grade: "5", teacher: "Mr Ng" } },
    ]);
  });

  it("reads the first column as names when there's no name or runner_id header", () => {
    expect(planImport("Kim\n  Sam \n\nAlex,Mr Ng\n", racers)).toStrictEqual({
      headerless: true,
      columns: [],
      updated: [],
      added: [{ name: "Kim", details: {} }],
      skipped: [],
    });
    expect(planImport("Jo", racers).skipped).toStrictEqual([
      { line: 1, reason: "2 racers are named Jo; add a runner_id" },
    ]);
  });
});
