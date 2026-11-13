export const DISTANCE_UNITS = ["m", "km", "mi"] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];
export const DEFAULT_DISTANCE_UNIT: DistanceUnit = "km";

export const isDistanceUnit = (unit: unknown): unit is DistanceUnit =>
  DISTANCE_UNITS.includes(unit as DistanceUnit);

// A race's lap length, when it has one.
export interface LapDistance {
  perLap: number;
  unit: DistanceUnit;
}

interface RaceDistance {
  lapDistance?: number | null;
  distanceUnit?: string;
}

// Races cached on a device before distances existed have neither field.
export const distanceUnit = (race: RaceDistance): DistanceUnit =>
  isDistanceUnit(race.distanceUnit) ? race.distanceUnit : DEFAULT_DISTANCE_UNIT;

export function lapDistance(race: RaceDistance): LapDistance | undefined {
  const perLap = race.lapDistance;
  if (!perLap || perLap <= 0) return undefined;
  return { perLap, unit: distanceUnit(race) };
}

// Laps as a distance, to 2 decimal places without trailing zeros.
export const distanceOf = (laps: number, { perLap }: LapDistance) =>
  String(Math.round(laps * perLap * 100) / 100);
