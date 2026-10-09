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

## Deploying with GitHub Actions

`.github/workflows/deploy.yml` runs lint, tests, the build and `npm audit` on every push and pull request, then:

- **Pull requests** get a Vercel preview deployment, and its URL is posted as a comment on the PR.
- **Pushes to `main`** run database migrations, then deploy to production.

`vercel.json` turns off Vercel's own Git deployments so nothing deploys twice; GitHub Actions is the only deployer.

One-time setup:

1. Run `npx vercel link` locally to create the project. This writes `.vercel/project.json` (gitignored); copy `orgId` and `projectId` from it.
2. Create a token at https://vercel.com/account/tokens.
3. Under GitHub repo **Settings** → **Secrets and variables** → **Actions**, add:
   - `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
   - `DATABASE_URL`: the production Neon connection string, used for migrations
4. Add `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and `DATABASE_URL` as Vercel environment variables, for Production and Preview. `vercel pull` copies them into the build.

## Security notes

- Every Server Action and data loader goes through `lib/authz.ts`. Each one checks that the caller is an active member of the group, and that every member ID it receives belongs to that same group. Anything else returns a 404.
- Shares are always recalculated on the server. Inputs are validated with Zod and capped (see `LIMITS` in `lib/rules.ts`).
- A placeholder member can only be claimed by an email Google has verified, through the invite link.
- CSV exports escape formulas. Security headers, including a Content Security Policy and `frame-ancestors 'none'`, are set in `next.config.ts`.
- Sign-in is open to any Google account. The caps in `lib/rules.ts` keep the free database from being filled.
