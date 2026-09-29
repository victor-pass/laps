import type { LapData, RaceData, RunnerData, ScanResult } from "@/api";
import { vi } from "vitest";

export function testLap(overrides: Partial<LapData> = {}): LapData {
  return {
    id: 1,
    runner: uuid(1),
    timestamp: "1970-01-01T00:00:00.000Z",
    race: uuid(1),
    ...overrides,
  };
}

export function testRace(overrides: Partial<RaceData> = {}): RaceData {
  return {
    id: uuid(1),
    name: "Spring 5k",
    lapFilterSeconds: 5,
    ...overrides,
  };
}

export function testRunner(overrides: Partial<RunnerData> = {}): RunnerData {
  return {
    ref: uuid(2),
    info: "Runner Bib 42",
    ...overrides,
  };
}

export function testScanResult(
  overrides: Partial<ScanResult> = {},
): ScanResult {
  return {
    runner: testRunner(),
    race: testRace(),
    lapCount: 1,
    ...overrides,
  };
}

export function uuid(id: number) {
  const end = `${id}`.padStart(12, "0");
  return `00000000-0000-0000-0000-${end}`;
}

export const jsonResponse = (json: unknown) =>
  new Response(JSON.stringify(json));

export const mockJSONRequest = (result: unknown) => {
  return vi.fn().mockResolvedValue(jsonResponse(result));
};
