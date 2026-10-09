ALTER TABLE "lap" ADD COLUMN "user_sub" text;--> statement-breakpoint
-- Laps from before this was recorded get their device's current user - the
-- best guess available, and right unless the device has changed hands.
UPDATE "lap" SET "user_sub" = "device"."user_sub" FROM "device" WHERE "lap"."device_id" = "device"."id";--> statement-breakpoint
ALTER TABLE "lap" ADD CONSTRAINT "lap_user_sub_user_sub_fkey" FOREIGN KEY ("user_sub") REFERENCES "user"("sub") ON DELETE SET NULL;