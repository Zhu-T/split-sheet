CREATE TYPE "public"."expense_event" AS ENUM('created', 'edited', 'deleted', 'restored', 'confirmed');--> statement-breakpoint
CREATE TABLE "expense_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"member_id" uuid,
	"action" "expense_event" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "auto_archive" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_events_expense_idx" ON "expense_events" USING btree ("expense_id","created_at");--> statement-breakpoint
CREATE INDEX "expense_events_group_idx" ON "expense_events" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "groups_digest_idx" ON "groups" USING btree ("discord_auto_digest","trip_end");--> statement-breakpoint
CREATE INDEX "groups_auto_archive_idx" ON "groups" USING btree ("auto_archive","archived_at","trip_end");--> statement-breakpoint
-- Give every existing expense and payment a starting "created" entry in its history.
INSERT INTO "expense_events" ("expense_id", "group_id", "member_id", "action", "after", "created_at")
SELECT e."id", e."group_id", e."created_by", 'created',
  jsonb_build_object(
    'kind', e."kind", 'description', e."description", 'amountMinor', e."amount_minor",
    'currency', e."currency", 'fxRate', e."fx_rate", 'date', e."date", 'payerId', e."payer_member_id",
    'splitType', e."split_type",
    'splits', COALESCE((SELECT jsonb_agg(jsonb_build_object('memberId', s."member_id", 'shareMinor', s."share_minor"))
                        FROM "expense_splits" s WHERE s."expense_id" = e."id"), '[]'::jsonb)
  ),
  e."created_at"
FROM "expenses" e;
