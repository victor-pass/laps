ALTER TABLE "race" ADD COLUMN "lap_distance" double precision;--> statement-breakpoint
ALTER TABLE "race" ADD COLUMN "distance_unit" text DEFAULT 'km' NOT NULL;