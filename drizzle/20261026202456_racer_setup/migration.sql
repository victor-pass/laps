CREATE TABLE "race_runner" (
	"race_id" uuid,
	"runner_ref" uuid,
	CONSTRAINT "race_runner_pkey" PRIMARY KEY("race_id","runner_ref")
);
--> statement-breakpoint
ALTER TABLE "runner" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "race_runner" ADD CONSTRAINT "race_runner_race_id_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "race"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "race_runner" ADD CONSTRAINT "race_runner_runner_ref_runner_ref_fkey" FOREIGN KEY ("runner_ref") REFERENCES "runner"("ref");--> statement-breakpoint
-- Every runner already scanned into a race is one of its racers.
INSERT INTO "race_runner" ("race_id", "runner_ref") SELECT DISTINCT "race_id", "runner_ref" FROM "lap";