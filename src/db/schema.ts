import {
  pgTable,
  uuid,
  timestamp,
  serial,
  index,
  uniqueIndex,
  integer,
  json,
  text,
  primaryKey,
} from "drizzle-orm/pg-core";

export const race = pgTable("race", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Minimum seconds between two counted laps for the same runner, used
  // client-side to collapse accidental repeat scans out of the summary and
  // the scan popup. Doesn't affect what's stored - only what's displayed.
  lapFilterSeconds: integer("lap_filter_seconds").notNull().default(5),
});
export const runner = pgTable("runner", {
  ref: uuid("ref").primaryKey(),
  info: json("info"),
});
export const lap = pgTable(
  "lap",
  {
    id: serial("id").primaryKey(),
    runner: uuid("runner_ref")
      .notNull()
      .references(() => runner.ref),
    race: uuid("race_id")
      .notNull()
      .references(() => race.id),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("runner_ref_idx").on(table.runner),
    // Offline scans are queued client-side and may be resent if a device
    // never saw the response to a sync it already completed. This makes
    // resending the same scan a no-op instead of double-counting the lap.
    uniqueIndex("lap_runner_race_timestamp_idx").on(
      table.runner,
      table.race,
      table.timestamp,
    ),
  ],
);

export const user = pgTable("user", {
  sub: text("sub").primaryKey(),
  name: text("name").notNull(),
  selectedRace: uuid("selected_race_id").references(() => race.id, {
    onDelete: "set null",
  }),
});

export const userRace = pgTable(
  "user_race",
  {
    user: text("user_sub")
      .notNull()
      .references(() => user.sub, { onDelete: "cascade" }),
    race: uuid("race_id")
      .notNull()
      .references(() => race.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.user, table.race] })],
);

// One row per browser/device. Touched on every authenticated request that
// carries an X-Device-Id header, so `lastSeen` doubles as a liveness signal
// for the summary view (see /races/:id/devices) without a dedicated
// heartbeat endpoint.
export const device = pgTable("device", {
  id: uuid("id").primaryKey(),
  user: text("user_sub")
    .notNull()
    .references(() => user.sub, { onDelete: "cascade" }),
  race: uuid("race_id").references(() => race.id, { onDelete: "set null" }),
  label: text("label"),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
});
