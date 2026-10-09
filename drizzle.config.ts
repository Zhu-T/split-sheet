import { defineConfig } from "drizzle-kit";

// Locally, read DATABASE_URL from .env.local (on Vercel it's already in the environment).
try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  // Migrations prefer the direct (unpooled) connection that Neon's Vercel integration provides.
  dbCredentials: { url: (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)! },
});
