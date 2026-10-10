# Split

A small Splitwise-style app for splitting shared expenses in groups. It runs on Vercel's free plan with a free Neon Postgres database. Sign-in is with Discord, used only to identify people: the app asks for Discord ID, display name and email, and nothing else.

## Features

- Groups with invite links. Only the owner can make a new link, which stops the old one working.
- Add people by name before they join. If you include their email, they take over that spot when they sign in through the invite link.
- Split equally, by exact amounts or by percentage, in 30 currencies. Exchange rates come from the ECB via Frankfurter and can be edited per expense.
- Balances, suggested settle-ups and recorded payments.
- Pay with Venmo from the settle-up screen when the person you owe has added their Venmo username. Venmo has no public API, so this opens a pre-filled payment in the Venmo app (or website), and you record the payment yourself once it's sent. USD only.
- Discord summaries: a group owner connects a channel webhook; the group's invite link is posted there when a new webhook is connected, and "Send test message" checks it any time. With **Notifications** on, at most one summary a day is posted automatically (Vercel Cron, only if something changed), or the owner can post one now. Groups can have **trip dates**: automatic summaries wait until the trip ends, then a whole-trip wrap-up is posted. Summaries list new expenses and payments, then who owes whom, @mentioning people who owe.
- A dashboard across all your groups, converted to your home currency.
- CSV export and "Delete my account".
- Designed for phones first, and can be installed to the home screen.

## Stack

- Next.js 16 (App Router, Cache Components, Server Actions) and Tailwind 4
- Auth.js v5 with Discord, using JWT sessions (no session table)
- Drizzle ORM with Neon serverless Postgres
- Vitest for the money, split and authorization rules

## Setup

### 1. Discord sign-in

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application named e.g. "Split".
2. Under **OAuth2**, copy the **Client ID** and reset/copy the **Client Secret**. These become `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET`.
3. Under **OAuth2 → Redirects**, add:
   - `http://localhost:3000/api/auth/callback/discord`
   - `https://<your-domain>/api/auth/callback/discord`

The app requests only the `identify` and `email` scopes, which don't need Discord's review. Sign-in requires a Discord account with a verified email.

### 2. Vercel and Neon

1. Import the repository into Vercel.
2. Under **Storage** (Marketplace), add **Neon**. This creates the database and sets `DATABASE_URL`.
3. Add these environment variables:
   - `AUTH_SECRET`: generate one with `npx auth secret`.
   - `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET`: from step 1.
4. Give **Preview** deployments their own Neon branch, so testing never touches real data. The Neon integration can create a branch per preview.

### 3. Database

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run db:migrate           # applies db/migrations to DATABASE_URL
```

After changing `db/schema.ts`, run `npm run db:generate` and commit the new migration.

### 4. Run

```bash
npm run dev    # http://localhost:3000
npm test       # unit tests
npm run build
```

## Deploying

- **Vercel's Git integration deploys.** Pushes to `main` go to production, and pull requests get preview URLs.
- **Production builds run migrations first.** Vercel runs `npm run vercel-build` (`scripts/vercel-build.mjs`), which applies `db/migrations` before `next build`. If a migration fails, the build fails and nothing goes live. Preview builds skip migrations unless `MIGRATE_ON_PREVIEW=1` is set; only set it when previews use their own Neon branch.
- **GitHub Actions only checks the code.** `.github/workflows/ci.yml` runs lint, tests, the build and `npm audit`. It needs no secrets.

One-time setup:

1. Import the repository in Vercel and add **Neon** from Storage. Neon sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`; migrations use the unpooled one.
2. Add `AUTH_SECRET`, `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET` as Vercel environment variables.
3. For the daily Discord summary, add `CRON_SECRET` (e.g. `openssl rand -hex 32`). `vercel.json` schedules `/api/cron/discord-digest` at 01:00 UTC (evening in the US); Hobby crons run once a day, sometime within that hour.
4. Optional: to keep failing code out of production, turn on Vercel's **Deployment Checks** for the `Lint, test, build` check (Project → Settings).

## Security notes

- Every Server Action and data loader goes through `lib/authz.ts`. Each one checks that the caller is an active member of the group, and that every member ID it receives belongs to that same group. Anything else returns a 404.
- Shares are always recalculated on the server. Inputs are validated with Zod and capped (see `LIMITS` in `lib/rules.ts`).
- A placeholder member can only be claimed by an email Discord has verified, through the invite link. A Discord account can't sign in if its email already belongs to a different Discord account.
- CSV exports escape formulas. Security headers, including a Content Security Policy and `frame-ancestors 'none'`, are set in `next.config.ts`.
- Discord webhook URLs are treated as secrets: only the owner can set them, only real `discord.com/api/webhooks/…` URLs are accepted, and the URL is never sent to the browser. Messages allow pings only for the specific users involved (no `@everyone`, `@here` or roles), and user text is markdown-escaped.
- Sign-in is open to any Discord account with a verified email. The caps in `lib/rules.ts` keep the free database from being filled.
