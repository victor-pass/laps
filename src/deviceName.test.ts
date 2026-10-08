import { describe, expect, it } from "vitest";
import { deviceName, deviceNames } from "./deviceName";

describe("deviceName", () => {
  it("gives a device an adjective, colour and animal name", () => {
    expect(deviceName("9b2e4c1a-7f3d-4e8a-b5c6-d1e2f3a4b5c6")).toStrictEqual(
      "Nifty Beige Cheetah",
    );
  });

  it("always gives the same device the same name", () => {
    const id = crypto.randomUUID();
    expect(deviceName(id)).toStrictEqual(deviceName(id));
    expect(deviceName(id.toUpperCase())).toStrictEqual(deviceName(id));
  });

  it("gives different devices different names", () => {
    const names = new Set(
      Array.from({ length: 50 }, () => deviceName(crypto.randomUUID())),
    );
    // Not guaranteed, but a collision among 50 is ~0.7% likely - allow one.
    expect(names.size).toBeGreaterThanOrEqual(49);
  });
});

describe("deviceNames", () => {
  it("uses the plain name when it's unique in the list", () => {
    const a = "00000000-0000-4000-8000-000000000001";
    const b = "00000000-0000-4000-8000-000000000002";
    expect([...deviceNames([a, b]).values()]).toStrictEqual([
      "Bouncy Amber Alpaca",
      "Bouncy Amber Badger",
    ]);
  });

  it("adds part of the id when two devices would share a name", () => {
    // Same name: first 8 digits equal mod 64, same last 12 digits.
    const a = "00000000-1111-4000-8000-000000000001";
    const b = "00000040-2222-4000-8000-000000000001";
    expect(deviceName(a)).toStrictEqual(deviceName(b));
    expect([...deviceNames([a, b]).values()]).toStrictEqual([
      "Bouncy Amber Alpaca (1111)",
      "Bouncy Amber Alpaca (2222)",
    ]);
  });
});
