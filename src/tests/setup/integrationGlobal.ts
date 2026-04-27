import { existsSync, unlinkSync } from "node:fs"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { TEST_DB_PATH } from "../helpers/testDb.js"

const MIGRATIONS_FOLDER = "./drizzle"

/**
 * Vitest globalSetup for the integration project. Runs once before any
 * integration test, and its returned function runs once after they all finish.
 *
 * Removes any stale `mable-backend-assessment-test.db`, creates a fresh one,
 * and applies all Drizzle migrations from `./drizzle` so tests start against a
 * schema that matches `src/db/schema.ts`. The migration connection is closed
 * before tests run; each test opens its own via `createTestDb()`.
 *
 * Throws if the migrations folder is missing — run `npx drizzle-kit generate`
 * to create it.
 *
 * @returns Teardown function that deletes the test DB after the run.
 */
export default async function setup() {
  if (!existsSync(MIGRATIONS_FOLDER)) {
    throw new Error(
      `No migrations found at ${MIGRATIONS_FOLDER}. Run \`npx drizzle-kit generate\` before running integration tests.`,
    )
  }

  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)

  const sqlite = new Database(TEST_DB_PATH)
  try {
    migrate(drizzle({ client: sqlite }), { migrationsFolder: MIGRATIONS_FOLDER })
  } finally {
    sqlite.close()
  }

  return () => {
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)
  }
}
