-- Keep any existing "shares" expenses: convert them to exact amounts using their already-computed shares, so balances are unchanged.
UPDATE "expense_splits" SET "input" = "share_minor" WHERE "expense_id" IN (SELECT "id" FROM "expenses" WHERE "split_type" = 'shares');--> statement-breakpoint
UPDATE "expenses" SET "split_type" = 'exact' WHERE "split_type" = 'shares';--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "split_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."split_type";--> statement-breakpoint
CREATE TYPE "public"."split_type" AS ENUM('equal', 'exact', 'percent');--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "split_type" SET DATA TYPE "public"."split_type" USING "split_type"::"public"."split_type";