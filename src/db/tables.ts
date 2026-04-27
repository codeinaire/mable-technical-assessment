import * as t from "drizzle-orm/sqlite-core"
import { sqliteTable as table } from "drizzle-orm/sqlite-core"

const TRANSFER_BATCHES_STATUS = [
  "pending",
  "processed",
  "partially_processed",
  "failed",
] as const

export type TransferBatchStatus = (typeof TRANSFER_BATCHES_STATUS)[number]

export const TransferBatchStatus = {
  PENDING: "pending",
  PROCESSED: "processed",
  PARTIALLY_PROCESSED: "partially_processed",
  FAILED: "failed",
} as const satisfies Record<string, TransferBatchStatus>

const baseColumns = {
  id: t.int().primaryKey({ autoIncrement: true }),
  createdAt: t.int("created_at", { mode: "timestamp" }),
}

export const companies = table("companies", {
  ...baseColumns,
  name: t.text("name").notNull(),
})

export const accounts = table("accounts", {
  ...baseColumns,
  accountNumber: t.text("account_number").unique().notNull(),
  companyId: t.int("company_id").references(() => companies.id),
})

export const balances = table("balances", {
  ...baseColumns,
  balanceCents: t.integer("balance_cents").notNull().default(0),
  accountId: t
    .int("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id, { onDelete: "cascade" }),
})

export const transferBatches = table("transfer_batches", {
  ...baseColumns,
  processedStartedAt: t.int("processed_at", { mode: "timestamp" }),
  processedFinishedAt: t.int("processed_at", { mode: "timestamp" }),
  status: t
    .text({ enum: TRANSFER_BATCHES_STATUS })
    .notNull()
    .default("pending"),
  companyId: t
    .int("company_id")
    .notNull()
    .references(() => companies.id),
})

const sharedForeignKeys = {
  batchId: t
    .int("batch_id")
    .notNull()
    .references(() => transferBatches.id),
}

export const transactions = table("transactions", {
  ...baseColumns,
  ...sharedForeignKeys,
  trasferredToId: t
    .int("transferred_to_id")
    .notNull()
    .references(() => accounts.id),
  trasferredFromId: t
    .int("transferred_from_id")
    .notNull()
    .references(() => accounts.id),
  amountCents: t.int("amount_cents").notNull(),
})

export const rejectedTransfers = table("rejected_transfers", {
  ...baseColumns,
  ...sharedForeignKeys,
  accountNumberFrom: t.text("account_number_from").notNull(),
  accountNumberTo: t.text("account_number_to").notNull(),
  rowNumber: t.int("row_number").notNull(),
  amountCents: t.int("amount_cents").notNull(),
  reason: t.text("reason"),
})
