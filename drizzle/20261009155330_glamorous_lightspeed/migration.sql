-- Laps recorded before devices were guaranteed a row (touchDevice was only
-- best-effort) lose their attribution rather than block the constraint.
UPDATE "lap" SET "device_id" = NULL WHERE "device_id" IS NOT NULL AND "device_id" NOT IN (SELECT "id" FROM "device");--> statement-breakpoint
ALTER TABLE "lap" ADD CONSTRAINT "lap_device_id_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE SET NULL;