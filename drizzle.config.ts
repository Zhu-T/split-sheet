import { defineConfig } from "drizzle-kit";

// Locally, read DATABASE_URL from .env.local (on Vercel it's already in the environment).
try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
