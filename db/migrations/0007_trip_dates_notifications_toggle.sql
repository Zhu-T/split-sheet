ALTER TABLE "groups" ALTER COLUMN "discord_auto_digest" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "trip_start" date;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "trip_end" date;