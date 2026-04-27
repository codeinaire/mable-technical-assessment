import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"

const DEFAULT_DB = process.env.DATABASE_URL

export function createDb(filePath: string | undefined = DEFAULT_DB) {
  if (!filePath) {
    throw new Error("No DB path was provided. Please provide DB path.")
  }
  const sqlite = new Database(filePath)
  return drizzle({ client: sqlite })
}

type Db = ReturnType<typeof createDb>
type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0]
export type DbOrTx = Db | DbTx
