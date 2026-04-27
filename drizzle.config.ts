import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/tables.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? "./db-file/mable-backend-assessment-prod.db",
  },
  strict: true,
  verbose: true,
})
