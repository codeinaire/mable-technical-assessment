import { eq } from "drizzle-orm"
import type { DbOrTx } from "../db/index.js"
import { accounts, balances } from "../db/tables.js"

export const Balance = {
  create: (balanceCents: number, accountId: number, db: DbOrTx) => {
    return db.insert(balances).values({ balanceCents, accountId }).run()
  },
  update: (accountId: number, balanceCents: number, db: DbOrTx) => {
    return db
      .update(balances)
      .set({ balanceCents })
      .where(eq(balances.accountId, accountId))
      .run()
  },
  getByAccountNumber: (accountNumber: string, db: DbOrTx) => {
    return db
      .select({ balanceCents: balances.balanceCents })
      .from(balances)
      .innerJoin(accounts, eq(accounts.id, balances.accountId))
      .where(eq(accounts.accountNumber, accountNumber))
      .get()
  },
}
