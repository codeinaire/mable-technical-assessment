import { eq } from "drizzle-orm"
import type { DbOrTx } from "../db/index.js"
import { companies } from "../db/tables.js"

export const Company = {
  create: (name: string, db: DbOrTx) => {
    return db
      .insert(companies)
      .values({ name, createdAt: new Date() })
      .returning()
      .get()
  },
  findById: (companyId: number, db: DbOrTx) => {
    const result = db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .get()
    return result
  },
}
