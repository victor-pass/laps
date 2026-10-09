import type { LapData } from "@/api";
import { runnerName } from "@/runner";
import { deviceNames } from "@/deviceName";

// Every recorded lap, unfiltered by the race's lap filter, oldest first.
// Includes the device that scanned each lap and who was signed in, so
// organizers can audit discrepancies - devices named as the summary's
// device list names them.
export function lapsCsv(laps: LapData[]): string {
  const names = deviceNames([
    ...new Set(laps.flatMap((lap) => (lap.device ? [lap.device] : []))),
  ]);
  const rows = [...laps]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .map((lap) => [
      lap.timestamp,
      lap.runner,
      runnerName(lap.info) ?? "",
      lap.device ?? "",
      lap.deviceLabel ?? (lap.device ? names.get(lap.device)! : ""),
      lap.userName ?? "",
    ]);
  const header = [
    "timestamp",
    "runner_id",
    "runner_name",
    "device_id",
    "device_name",
    "user",
  ];
  return [header, ...rows]
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
