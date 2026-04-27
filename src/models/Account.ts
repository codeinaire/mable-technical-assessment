import { eq, inArray } from "drizzle-orm"
import type { DbOrTx } from "../db/index.js"
import { accounts, balances } from "../db/tables.js"

export const Account = {
  findWithBalance: (accountNumber: string, db: DbOrTx) => {
    return db
      .select()
      .from(accounts)
      .innerJoin(balances, eq(accounts.id, balances.accountId))
      .where(eq(accounts.accountNumber, accountNumber))
      .get()
  },
  findByAccountNumbers: (accountNumbers: string[], db: DbOrTx) => {
    return db
      .select()
      .from(accounts)
      .where(inArray(accounts.accountNumber, accountNumbers))
      .all()
  },
  create: (accountNumber: string, companyId: number, db: DbOrTx) => {
    return db
      .insert(accounts)
      .values({ accountNumber, companyId })
      .returning()
      .get()
  },
}
