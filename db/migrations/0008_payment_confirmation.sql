ALTER TABLE "expenses" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "require_payment_confirmation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Existing payments already count towards balances, so they start out confirmed.
UPDATE "expenses" SET "confirmed_at" = "created_at" WHERE "kind" = 'settlement';
