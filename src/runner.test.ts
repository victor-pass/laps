import { describe, expect, it } from "vitest";
import { runnerName, runnerQrData, runnerRef } from "./runner";

describe("runnerName", () => {
  it("prefers the assigned name", () => {
    expect(runnerName({ name: "Sam", info: "bib:42" })).toBe("Sam");
  });

  it("falls back to the scanned text, or its JSON name", () => {
    expect(runnerName({ name: null, info: "bib:42" })).toBe("bib:42");
    expect(runnerName({ info: { name: "Jamie" } })).toBe("Jamie");
  });

  it("doesn't treat a bare id as a name", () => {
    expect(
      runnerName({ info: "11111111-2222-3333-4444-555555555555" }),
    ).toBeUndefined();
  });
});

describe("runnerQrData", () => {
  it("is a racer's own id when they weren't added by a scan", () => {
    const ref = "11111111-2222-3333-4444-555555555555";
    expect(runnerQrData({ ref, info: null })).toBe(ref);
  });

  it("is the originally scanned text, which maps back to the same runner", async () => {
    const ref = await runnerRef("bib:42");
    const data = runnerQrData({ ref, info: "bib:42" });
    expect(await runnerRef(data)).toBe(ref);
  });

  it("is the id for scanned JSON, which can't be reproduced exactly", () => {
    const ref = "11111111-2222-3333-4444-555555555555";
    expect(runnerQrData({ ref, info: { name: "Jamie" } })).toBe(ref);
  });
});

describe("runnerRef", () => {
  it("is consistent for the same qr data", async () => {
    const a = await runnerRef("bib:1234");
    const b = await runnerRef("bib:1234");
    expect(a).toEqual(b);
  });

  it("differs for different qr data", async () => {
    const a = await runnerRef("bib:1234");
    const b = await runnerRef("bib:5678");
    expect(a).not.toEqual(b);
  });

  it("returns a valid uuid", async () => {
    const ref = await runnerRef("https://example.com/runner/42");
    expect(ref).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("passes an already-valid uuid through unchanged", async () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    expect(await runnerRef(uuid)).toEqual(uuid);
  });

  it("normalizes case and whitespace on a uuid", async () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    expect(await runnerRef(` ${uuid.toUpperCase()} `)).toEqual(uuid);
  });
});
