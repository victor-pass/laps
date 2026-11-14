export const DEMO_USER_ID = "laps-demo-user";
export const DEMO_USER_NAME = "Demo Organizer";

export function uuid(id: number): string {
  return `00000000-0000-0000-0000-${String(id).padStart(12, "0")}`;
}

export const DEMO_DEVICE_ID = uuid(900);
export const DEMO_RACE_ID = uuid(901);
export const DEMO_RACE_NAME = "Spring 5k";
export const DEMO_RACER_ID = uuid(42);
export const DEMO_RACER_NAME = "Caleb";
export const SECOND_RACER_ID = uuid(43);
export const SECOND_RACER_NAME = "Alex";
export const FIXED_NOW = "2026-11-13T17:00:00.000Z";
