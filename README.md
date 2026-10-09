# Split

A small Splitwise-style app for splitting shared expenses in groups. It runs on Vercel's free plan with a free Neon Postgres database. Google sign-in only identifies people: the app asks for name and email and nothing else.

## Features

- Groups with invite links. Only the owner can make a new link, which stops the old one working.
- Add people by name before they join. If you include their email, they take over that spot when they sign in through the invite link.
- Split equally, by exact amounts, by percentage or by shares, in 30 currencies. Exchange rates come from the ECB via Frankfurter and can be edited per expense.
- Balances, suggested settle-ups and recorded payments.
- A dashboard across all your groups, converted to your home currency.
- CSV export and "Delete my account".
- Designed for phones first, and can be installed to the home screen.

## Stack

- Next.js 16 (App Router, Cache Components, Server Actions) and Tailwind 4
- Auth.js v5 with Google, using JWT sessions (no session table)
- Drizzle ORM with Neon serverless Postgres
- Vitest for the money, split and authorization rules

## Setup

### 1. Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/), open **APIs & Services**, then **OAuth consent screen**. Choose **External** and add only the `openid`, `email` and `profile` scopes. Publish the app. These scopes aren't sensitive, so Google doesn't need to review it.
2. Go to **Credentials** and create an **OAuth client ID** of type **Web application**.
3. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<your-domain>/api/auth/callback/google`

### 2. Vercel and Neon

1. Import the repository into Vercel.
2. Under **Storage** (Marketplace), add **Neon**. This creates the database and sets `DATABASE_URL`.
3. Add these environment variables:
   - `AUTH_SECRET`: generate one with `npx auth secret`.
   - `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`: from step 1.
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
2. Add `AUTH_SECRET`, `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` as Vercel environment variables.
3. Optional: to keep failing code out of production, turn on Vercel's **Deployment Checks** for the `Lint, test, build` check (Project → Settings).

## Security notes

- Every Server Action and data loader goes through `lib/authz.ts`. Each one checks that the caller is an active member of the group, and that every member ID it receives belongs to that same group. Anything else returns a 404.
- Shares are always recalculated on the server. Inputs are validated with Zod and capped (see `LIMITS` in `lib/rules.ts`).
- A placeholder member can only be claimed by an email Google has verified, through the invite link.
- CSV exports escape formulas. Security headers, including a Content Security Policy and `frame-ancestors 'none'`, are set in `next.config.ts`.
- Sign-in is open to any Google account. The caps in `lib/rules.ts` keep the free database from being filled.
