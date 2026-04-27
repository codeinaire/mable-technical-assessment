import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DbOrTx } from "../../db/index.js"
import {
  rejectedTransfers,
  TransferBatchStatus,
  transactions,
  transferBatches,
} from "../../db/tables.js"
import { Account } from "../../models/Account.js"
import { Balance } from "../../models/Balance.js"
import { Company } from "../../models/Company.js"
import { TransactionProcessor } from "../../services/processTransactions.js"
import type { ParsedCsv } from "../../types/csv.js"
import { createTestDb } from "../helpers/testDb.js"

let db: ReturnType<typeof createTestDb>

const ACCOUNT_A = "1111234522226789"
const ACCOUNT_B = "2222123433331212"
const ACCOUNT_C = "3212343433335755"

function seedCompanyAndAccounts(
  db: DbOrTx,
  accountData: { accountNumber: string; balanceCents: number }[],
) {
  const company = Company.create("Test Company", db)

  for (const { accountNumber, balanceCents } of accountData) {
    const account = Account.create(accountNumber, company.id, db)

    Balance.create(balanceCents, account.id, db)
  }

  return company
}

vi.spyOn(console, "info").mockImplementation(() => {})

describe("processTransactions", () => {
  beforeEach(() => {
    db = createTestDb()
    migrate(db, { migrationsFolder: "./drizzle" })
  })

  it("processes valid transactions and updates balances", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 500_000 },
      { accountNumber: ACCOUNT_B, balanceCents: 100_000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [{ from: ACCOUNT_A, to: ACCOUNT_B, amount: 50_000, rowNumber: 1 }],
      invalid: [],
    }

    const result = new TransactionProcessor(company.id, parsedCsv, db).run()

    expect(result.processedTransactions).toEqual({
      count: 1,
      amountTranferred: "500.00",
    })
    expect(result.rejectedRows).toHaveLength(0)
    expect(result.invalidRows).toHaveLength(0)

    expect(Balance.getByAccountNumber(ACCOUNT_A, db)?.balanceCents).toBe(
      450_000,
    )
    expect(Balance.getByAccountNumber(ACCOUNT_B, db)?.balanceCents).toBe(
      150_000,
    )
  })

  it("rejects a transaction when the from account is not found", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_B, balanceCents: 100_000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [{ from: ACCOUNT_A, to: ACCOUNT_B, amount: 10_000, rowNumber: 1 }],
      invalid: [],
    }

    const result = new TransactionProcessor(company.id, parsedCsv, db).run()

    expect(result.processedTransactions).toBeUndefined()
    expect(result.rejectedRows).toHaveLength(1)
    expect(result.rejectedRows[0].errors[0].path).toBe("from")
    expect(result.rejectedRows[0].errors[0].message).toContain(ACCOUNT_A)

    expect(Balance.getByAccountNumber(ACCOUNT_B, db)?.balanceCents).toBe(
      100_000,
    )
  })

  it("rejects a transaction when balance would go below zero", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 1_000 },
      { accountNumber: ACCOUNT_B, balanceCents: 100_000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [{ from: ACCOUNT_A, to: ACCOUNT_B, amount: 5_000, rowNumber: 1 }],
      invalid: [],
    }

    const result = new TransactionProcessor(company.id, parsedCsv, db).run()

    expect(result.rejectedRows).toHaveLength(1)
    expect(result.rejectedRows[0].errors[0].path).toBe("amount")

    expect(Balance.getByAccountNumber(ACCOUNT_A, db)?.balanceCents).toBe(1_000)
  })

  it("passes through invalid rows from CSV parsing", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 500_000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [],
      invalid: [
        {
          rowNumber: 1,
          raw: { from: "bad", to: ACCOUNT_A, amount: "xyz" },
          errors: [{ path: "from", message: "invalid" }],
        },
      ],
    }

    const result = new TransactionProcessor(company.id, parsedCsv, db).run()

    expect(result.invalidRows).toHaveLength(1)
    expect(result.processedTransactions).toBeUndefined()
  })

  it("processes multiple transactions sequentially and updates balances correctly", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 500_000 },
      { accountNumber: ACCOUNT_B, balanceCents: 100_000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [
        { from: ACCOUNT_A, to: ACCOUNT_B, amount: 100_000, rowNumber: 1 },
        { from: ACCOUNT_A, to: ACCOUNT_B, amount: 200_000, rowNumber: 2 },
      ],
      invalid: [],
    }

    const result = new TransactionProcessor(company.id, parsedCsv, db).run()

    expect(result.processedTransactions).toEqual({
      count: 2,
      amountTranferred: "3000.00",
    })

    expect(Balance.getByAccountNumber(ACCOUNT_A, db)?.balanceCents).toBe(
      200_000,
    )
    expect(Balance.getByAccountNumber(ACCOUNT_B, db)?.balanceCents).toBe(
      400_000,
    )
  })

  it("handles a mix of valid, invalid, and rejected rows", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 500_000 },
      { accountNumber: ACCOUNT_B, balanceCents: 100_000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [
        { from: ACCOUNT_A, to: ACCOUNT_B, amount: 50_000, rowNumber: 1 },
        { from: ACCOUNT_C, to: ACCOUNT_B, amount: 10_000, rowNumber: 2 },
      ],
      invalid: [
        {
          rowNumber: 3,
          raw: { from: "bad", to: ACCOUNT_B, amount: "100" },
          errors: [{ path: "from", message: "invalid" }],
        },
      ],
    }

    const result = new TransactionProcessor(company.id, parsedCsv, db).run()

    expect(result.processedTransactions).toEqual({
      count: 1,
      amountTranferred: "500.00",
    })
    expect(result.rejectedRows).toHaveLength(1)
    expect(result.invalidRows).toHaveLength(1)
  })

  it("creates a transfer batch with processed status on full success", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 500_000 },
      { accountNumber: ACCOUNT_B, balanceCents: 100_000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [{ from: ACCOUNT_A, to: ACCOUNT_B, amount: 10_000, rowNumber: 1 }],
      invalid: [],
    }

    new TransactionProcessor(company.id, parsedCsv, db).run()

    const batch = db.select().from(transferBatches).all()
    expect(batch).toHaveLength(1)
    expect(batch[0].status).toBe(TransferBatchStatus.PROCESSED)
  })

  it("sets batch status to failed when all rows are rejected", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 100 },
      { accountNumber: ACCOUNT_B, balanceCents: 10_0000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [{ from: ACCOUNT_A, to: ACCOUNT_B, amount: 50_000, rowNumber: 1 }],
      invalid: [],
    }

    new TransactionProcessor(company.id, parsedCsv, db).run()

    const batch = db.select().from(transferBatches).all()
    expect(batch[0].status).toBe(TransferBatchStatus.FAILED)
  })

  it("sets batch status to partially_processed with mixed results", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 500_000 },
      { accountNumber: ACCOUNT_B, balanceCents: 100_000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [
        { from: ACCOUNT_A, to: ACCOUNT_B, amount: 10_000, rowNumber: 1 },
        { from: ACCOUNT_C, to: ACCOUNT_B, amount: 10_000, rowNumber: 2 },
      ],
      invalid: [],
    }

    new TransactionProcessor(company.id, parsedCsv, db).run()

    const batch = db.select().from(transferBatches).all()
    expect(batch[0].status).toBe(TransferBatchStatus.PARTIALLY_PROCESSED)
  })

  it("creates transaction records for successful transfers", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 500_000 },
      { accountNumber: ACCOUNT_B, balanceCents: 100_000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [{ from: ACCOUNT_A, to: ACCOUNT_B, amount: 25_000, rowNumber: 1 }],
      invalid: [],
    }

    new TransactionProcessor(company.id, parsedCsv, db).run()

    const txns = db.select().from(transactions).all()
    expect(txns).toHaveLength(1)
    expect(txns[0].amountCents).toBe(25_000)
  })

  it("creates rejected transfer records in the database", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_B, balanceCents: 100_000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [{ from: ACCOUNT_A, to: ACCOUNT_B, amount: 1_0000, rowNumber: 1 }],
      invalid: [],
    }

    new TransactionProcessor(company.id, parsedCsv, db).run()

    const rejected = db.select().from(rejectedTransfers).all()
    expect(rejected).toHaveLength(1)
    expect(rejected[0].accountNumberFrom).toBe(ACCOUNT_A)
    expect(rejected[0].accountNumberTo).toBe(ACCOUNT_B)
  })

  it("calculates the example mable_transactions.csv accurately", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: "1111234522226789", balanceCents: 500_000 },
      { accountNumber: "1111234522221234", balanceCents: 1_000_000 },
      { accountNumber: "2222123433331212", balanceCents: 55_000 },
      { accountNumber: "1212343433335665", balanceCents: 120_000 },
      { accountNumber: "3212343433335755", balanceCents: 5_000_000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [
        {
          from: "1111234522226789",
          to: "1212343433335665",
          amount: 50_000,
          rowNumber: 1,
        },
        {
          from: "3212343433335755",
          to: "2222123433331212",
          amount: 100_000,
          rowNumber: 2,
        },
        {
          from: "3212343433335755",
          to: "1111234522226789",
          amount: 32_050,
          rowNumber: 3,
        },
        {
          from: "1111234522221234",
          to: "1212343433335665",
          amount: 2_560,
          rowNumber: 4,
        },
      ],
      invalid: [],
    }

    const result = new TransactionProcessor(company.id, parsedCsv, db).run()

    expect(result.processedTransactions).toEqual({
      count: 4,
      amountTranferred: "1846.10",
    })
    expect(result.rejectedRows).toHaveLength(0)
    expect(result.invalidRows).toHaveLength(0)

    expect(
      Balance.getByAccountNumber("1111234522226789", db)?.balanceCents,
    ).toBe(48_2050)
    expect(
      Balance.getByAccountNumber("1111234522221234", db)?.balanceCents,
    ).toBe(997_440)
    expect(
      Balance.getByAccountNumber("2222123433331212", db)?.balanceCents,
    ).toBe(155_000)
    expect(
      Balance.getByAccountNumber("1212343433335665", db)?.balanceCents,
    ).toBe(172_560)
    expect(
      Balance.getByAccountNumber("3212343433335755", db)?.balanceCents,
    ).toBe(4_867_950)
  })
})
