import type { DbOrTx } from "../db/index.js"
import { transactions } from "../db/tables.js"

export const Transaction = {
  create: (
    from: number,
    to: number,
    amount: number,
    batchId: number,
    db: DbOrTx,
  ) => {
    return db
      .insert(transactions)
      .values({
        trasferredFromId: from,
        trasferredToId: to,
        amountCents: amount,
        batchId,
      })
      .run()
  },
}
