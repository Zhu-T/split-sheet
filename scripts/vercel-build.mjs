// Vercel runs `npm run vercel-build` instead of `build` when it exists.
// Production builds apply database migrations first, so new code never goes live
// against an old schema; a failed migration fails the build and nothing is deployed.
// Preview builds skip migrations so an unmerged branch can't change the production
// schema. Set MIGRATE_ON_PREVIEW=1 if previews use their own Neon branch.
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV;
const migrate = env === "production" || (env === "preview" && process.env.MIGRATE_ON_PREVIEW === "1");

if (migrate) {
  console.log(`[vercel-build] Applying database migrations (${env})`);
  execSync("npx drizzle-kit migrate", { stdio: "inherit" });
} else {
  console.log(`[vercel-build] Skipping migrations (VERCEL_ENV=${env ?? "unset"})`);
}

execSync("npx next build", { stdio: "inherit" });
