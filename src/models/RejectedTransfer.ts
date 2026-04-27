import type { DbOrTx } from "../db/index.js"
import { rejectedTransfers } from "../db/tables.js"
import type { ValidRow } from "../types/csv.js"

export const RejectedTransfer = {
  create: (
    transactionRow: ValidRow,
    reason: string,
    batchId: number,
    db: DbOrTx,
  ) => {
    const {
      from: accountNumberFrom,
      to: accountNumberTo,
      amount: amountCents,
      rowNumber,
    } = transactionRow
    return db
      .insert(rejectedTransfers)
      .values({
        accountNumberFrom,
        accountNumberTo,
        amountCents,
        rowNumber,
        reason,
        batchId,
      })
      .run()
  },
}
