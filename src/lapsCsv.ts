import type { LapData } from "@/api";
import { runnerName } from "@/runner";
import { deviceNames } from "@/deviceName";
import { countByRunner } from "@/lapDedupe";
import { detailKeys, type Details } from "@/racerDetails";
import { distanceOf, type LapDistance } from "@/distance";

export function lapsCsv(laps: LapData[]): string {
  const names = deviceNames([
    ...new Set(laps.flatMap((lap) => (lap.device ? [lap.device] : []))),
  ]);
  const rows = [...laps]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .map((lap) => [
      lap.timestamp,
      lap.runner,
      runnerName(lap) ?? "",
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
  return toCsv([header, ...rows]);
}

function csvCell(value: string): string {
  // Runner names come straight from QR codes, so stop a spreadsheet from
  // treating one like "=HYPERLINK(...)" as a formula.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function lapsCsvFilename(raceName: string, report = "laps"): string {
  return `${slugify(raceName) || "race"}-${slugify(report) || "report"}.csv`;
}

interface ReportRacer {
  ref: string;
  name: string | null;
  info: unknown;
  details: Details;
}

export interface ReportOptions {
  from?: Date; // inclusive
  to?: Date; // inclusive
  filterSeconds: number;
  groupBy: string; // racers without field match NO_GROUP.
  distance?: LapDistance;
}

export const NO_GROUP = "(none)";

interface ReportRow {
  racer: ReportRacer;
  group: string;
  laps: number;
}

function reportRows(
  racers: ReportRacer[],
  laps: LapData[],
  { from, to, filterSeconds, groupBy }: ReportOptions,
): ReportRow[] {
  const inWindow = laps.filter((lap) => {
    const ms = Date.parse(lap.timestamp);
    return (!from || ms >= from.getTime()) && (!to || ms <= to.getTime());
  });
  const counts = countByRunner(inWindow, filterSeconds);
  const all = new Map(racers.map((r) => [r.ref, r]));
  for (const lap of inWindow)
    if (!all.has(lap.runner))
      all.set(lap.runner, {
        ref: lap.runner,
        name: lap.name,
        info: lap.info,
        details: {},
      });

  return [...all.values()]
    .map((racer) => ({
      racer,
      group: racer.details[groupBy] ?? NO_GROUP,
      laps: counts.get(racer.ref) ?? 0,
    }))
    .sort(
      (a, b) =>
        compareGroups(a.group, b.group) ||
        (runnerName(a.racer) ?? "￿").localeCompare(
          runnerName(b.racer) ?? "￿",
        ) ||
        a.racer.ref.localeCompare(b.racer.ref),
    );
}

// Alphabetical, numbers in order (grade 2 before 10), "(none)" last.
const compareGroups = (a: string, b: string) =>
  a === b
    ? 0
    : a === NO_GROUP
      ? 1
      : b === NO_GROUP
        ? -1
        : a.localeCompare(b, undefined, { numeric: true });

const average = (laps: number, racers: number) =>
  racers ? String(Math.round((laps / racers) * 100) / 100) : "0";

export function groupCsv(
  racers: ReportRacer[],
  laps: LapData[],
  options: ReportOptions,
): string {
  const groups = new Map<string, { racers: number; laps: number }>();
  for (const row of reportRows(racers, laps, options)) {
    const g = groups.get(row.group) ?? { racers: 0, laps: 0 };
    g.racers++;
    g.laps += row.laps;
    groups.set(row.group, g);
  }
  const total = [...groups.values()].reduce(
    (t, g) => ({ racers: t.racers + g.racers, laps: t.laps + g.laps }),
    { racers: 0, laps: 0 },
  );
  const { distance } = options;
  const rows = [...groups, ["Total", total] as const].map(([group, g]) => [
    group,
    String(g.racers),
    String(g.laps),
    average(g.laps, g.racers),
    ...(distance
      ? [
          distanceOf(g.laps, distance),
          g.racers ? distanceOf(g.laps / g.racers, distance) : "0",
        ]
      : []),
  ]);
  return toCsv([
    [
      options.groupBy || "group",
      "racers",
      "laps",
      "average_laps",
      ...(distance
        ? [`distance_${distance.unit}`, `average_distance_${distance.unit}`]
        : []),
    ],
    ...rows,
  ]);
}

export function racersCsv(
  racers: ReportRacer[],
  laps: LapData[],
  options: ReportOptions,
): string {
  const rows = reportRows(racers, laps, options);
  const keys = detailKeys(rows.map((r) => r.racer));
  const { distance } = options;
  return toCsv([
    [
      "name",
      "runner_id",
      ...keys,
      "laps",
      ...(distance ? [`distance_${distance.unit}`] : []),
    ],
    ...rows.map(({ racer, laps }) => [
      runnerName(racer) ?? "",
      racer.ref,
      ...keys.map((k) => racer.details[k] ?? ""),
      String(laps),
      ...(distance ? [distanceOf(laps, distance)] : []),
    ]),
  ]);
}

export function racerTemplateCsv(racers: ReportRacer[]): string {
  const keys = detailKeys(racers);
  const named = racers.map((racer) => ({ racer, name: runnerName(racer) }));
  named.sort(
    (a, b) =>
      (a.name ?? "￿").localeCompare(b.name ?? "￿") ||
      a.racer.ref.localeCompare(b.racer.ref),
  );
  return toCsv([
    ["name", "runner_id", ...keys],
    ...named.map(({ racer, name }) => [
      name ?? "",
      racer.ref,
      ...keys.map((k) => racer.details[k] ?? ""),
    ]),
  ]);
}

const toCsv = (rows: string[][]) =>
  rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
