import { expect, describe, it } from "vitest";
import { createScanDedupe } from "@/scanDedupe";

describe("createScanDedupe", () => {
  it("processes the first sighting of a QR code", () => {
    const dedupe = createScanDedupe(1000);
    expect(dedupe.shouldProcess("Bib 42", 0)).toBe(true);
  });

  it("ignores a repeat within the window", () => {
    const dedupe = createScanDedupe(1000);
    dedupe.shouldProcess("Bib 42", 0);
    expect(dedupe.shouldProcess("Bib 42", 999)).toBe(false);
  });

  it("processes again once the window has passed", () => {
    const dedupe = createScanDedupe(1000);
    dedupe.shouldProcess("Bib 42", 0);
    expect(dedupe.shouldProcess("Bib 42", 1000)).toBe(true);
  });

  it("tracks each distinct QR code independently", () => {
    const dedupe = createScanDedupe(1000);
    dedupe.shouldProcess("Bib 42", 0);
    expect(dedupe.shouldProcess("Bib 99", 0)).toBe(true);
  });
});
