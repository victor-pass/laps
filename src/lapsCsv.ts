import type { LapData } from "@/api";
import { runnerName } from "@/runner";

// Every recorded lap, unfiltered by the race's lap filter, oldest first.
export function lapsCsv(laps: LapData[]): string {
  const rows = [...laps]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .map((lap) => [lap.timestamp, lap.runner, runnerName(lap.info) ?? ""]);
  return [["timestamp", "runner_id", "runner_name"], ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

function csvCell(value: string): string {
  // Runner names come straight from QR codes, so stop a spreadsheet from
  // treating one like "=HYPERLINK(...)" as a formula.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function lapsCsvFilename(raceName: string): string {
  const slug = raceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "race"}-laps.csv`;
}
