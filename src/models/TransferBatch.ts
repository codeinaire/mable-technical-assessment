import { eq } from "drizzle-orm"
import type { DbOrTx } from "../db/index.js"
import { type TransferBatchStatus, transferBatches } from "../db/tables.js"

export const TransferBatch = {
  create: (companyId: number, db: DbOrTx) => {
    return db
      .insert(transferBatches)
      .values({ companyId, processedStartedAt: new Date() })
      .returning()
      .get()
  },
  updateById: (batchId: number, status: TransferBatchStatus, db: DbOrTx) => {
    return db
      .update(transferBatches)
      .set({ status, processedFinishedAt: new Date() })
      .where(eq(transferBatches.id, batchId))
      .run()
  },
}
