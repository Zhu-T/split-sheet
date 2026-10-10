ALTER TABLE "groups" ADD COLUMN "discord_last_posted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "discord_auto_digest" boolean DEFAULT true NOT NULL;