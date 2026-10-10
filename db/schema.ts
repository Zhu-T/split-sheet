import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("member_role", ["owner", "member"]);
export const kindEnum = pgEnum("expense_kind", ["expense", "settlement"]);
export const splitTypeEnum = pgEnum("split_type", ["equal", "exact", "percent"]);

const money = (name: string) => bigint(name, { mode: "number" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  discordId: text("discord_id").unique(), // sign-in identity
  email: text("email").notNull().unique(), // always lowercased; verified by Discord
  name: text("name").notNull(), // chosen by the user on first sign-in (defaults to their Discord name)
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }), // null until they've confirmed their name
  homeCurrency: text("home_currency").notNull().default("USD"),
  venmoUsername: text("venmo_username"), // optional; shown to people in your groups so they can pay you
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  baseCurrency: text("base_currency").notNull(),
  // Optional trip dates (calendar days). Automatic Discord summaries wait until the trip ends.
  tripStart: date("trip_start", { mode: "string" }),
  tripEnd: date("trip_end", { mode: "string" }),
  inviteToken: text("invite_token").notNull().unique(),
  // Secret (anyone with it can post to the channel): only the owner can set it; never sent to browsers.
  discordWebhookUrl: text("discord_webhook_url"),
  // Daily summary: when it was last posted (enforces one per day) and the owner's
  // notifications toggle (off until turned on; only automatic posts depend on it).
  discordLastPostedAt: timestamp("discord_last_posted_at", { withTimezone: true }),
  discordAutoDigest: boolean("discord_auto_digest").notNull().default(false),
  // Optional: payments recorded by the payer wait for the person being paid to confirm them.
  requirePaymentConfirmation: boolean("require_payment_confirmation").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }), // null = placeholder
    displayName: text("display_name").notNull(),
    email: text("email"), // lets a placeholder be claimed by this (verified) Google email
    role: roleEnum("role").notNull().default("member"),
    active: boolean("active").notNull().default(true),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("members_group_idx").on(t.groupId),
    index("members_user_idx").on(t.userId),
    uniqueIndex("members_group_user_uq").on(t.groupId, t.userId),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    kind: kindEnum("kind").notNull().default("expense"),
    description: text("description").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    payerMemberId: uuid("payer_member_id").notNull().references(() => members.id),
    amountMinor: money("amount_minor").notNull(),
    currency: text("currency").notNull(),
    fxRate: doublePrecision("fx_rate").notNull().default(1), // base units per 1 unit of currency
    splitType: splitTypeEnum("split_type").notNull(),
    createdBy: uuid("created_by").references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Payments only: when the person being paid confirmed it. Unconfirmed payments still count
    // towards balances; this only records that the recipient checked it (when the group asks).
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [index("expenses_group_date_idx").on(t.groupId, t.date)],
);

export const expenseSplits = pgTable(
  "expense_splits",
  {
    expenseId: uuid("expense_id").notNull().references(() => expenses.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id),
    input: doublePrecision("input").notNull(), // raw %, weight or minor units as entered
    shareMinor: money("share_minor").notNull(),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.memberId] })],
);

export type Group = typeof groups.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
