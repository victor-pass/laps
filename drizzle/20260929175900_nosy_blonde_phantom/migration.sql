CREATE TABLE "device" (
	"id" uuid PRIMARY KEY,
	"user_sub" text NOT NULL,
	"race_id" uuid,
	"label" text,
	"last_seen" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "lap_runner_race_timestamp_idx" ON "lap" ("runner_ref","race_id","timestamp");--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_user_sub_user_sub_fkey" FOREIGN KEY ("user_sub") REFERENCES "user"("sub") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_race_id_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "race"("id") ON DELETE SET NULL;