import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DbOrTx } from "../../db/index.js"
import {
  rejectedTransfers,
  transactions,
  transferBatches,
} from "../../db/tables.js"
import { Account } from "../../models/Account.js"
import { Balance } from "../../models/Balance.js"
import { Company } from "../../models/Company.js"
import { processTransactions } from "../../services/processTransactions.js"
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
      { accountNumber: ACCOUNT_A, balanceCents: 500000 },
      { accountNumber: ACCOUNT_B, balanceCents: 100000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [{ from: ACCOUNT_A, to: ACCOUNT_B, amount: 50000, rowNumber: 1 }],
      invalid: [],
    }

    const result = processTransactions(company.id, parsedCsv, db)

    expect(result.processedTransactions).toEqual({
      count: 1,
      amountTranferred: 50000,
    })
    expect(result.rejectedRows).toHaveLength(0)
    expect(result.invalidRows).toHaveLength(0)

    expect(Balance.getByAccountNumber(ACCOUNT_A, db)?.balanceCents).toBe(450000)
    expect(Balance.getByAccountNumber(ACCOUNT_B, db)?.balanceCents).toBe(150000)
  })

  it("rejects a transaction when the from account is not found", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_B, balanceCents: 100000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [{ from: ACCOUNT_A, to: ACCOUNT_B, amount: 10000, rowNumber: 1 }],
      invalid: [],
    }

    const result = processTransactions(company.id, parsedCsv, db)

    expect(result.processedTransactions).toBeUndefined()
    expect(result.rejectedRows).toHaveLength(1)
    expect(result.rejectedRows[0].errors[0].path).toBe("from")
    expect(result.rejectedRows[0].errors[0].message).toContain(ACCOUNT_A)

    expect(Balance.getByAccountNumber(ACCOUNT_B, db)?.balanceCents).toBe(100000)
  })

  it("rejects a transaction when balance would go below zero", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 1000 },
      { accountNumber: ACCOUNT_B, balanceCents: 100000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [{ from: ACCOUNT_A, to: ACCOUNT_B, amount: 5000, rowNumber: 1 }],
      invalid: [],
    }

    const result = processTransactions(company.id, parsedCsv, db)

    expect(result.rejectedRows).toHaveLength(1)
    expect(result.rejectedRows[0].errors[0].path).toBe("amount")

    expect(Balance.getByAccountNumber(ACCOUNT_A, db)?.balanceCents).toBe(1000)
  })

  it("passes through invalid rows from CSV parsing", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 500000 },
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

    const result = processTransactions(company.id, parsedCsv, db)

    expect(result.invalidRows).toHaveLength(1)
    expect(result.processedTransactions).toBeUndefined()
  })

  it("processes multiple transactions sequentially and updates balances correctly", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 500000 },
      { accountNumber: ACCOUNT_B, balanceCents: 100000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [
        { from: ACCOUNT_A, to: ACCOUNT_B, amount: 100000, rowNumber: 1 },
        { from: ACCOUNT_A, to: ACCOUNT_B, amount: 200000, rowNumber: 2 },
      ],
      invalid: [],
    }

    const result = processTransactions(company.id, parsedCsv, db)

    expect(result.processedTransactions).toEqual({
      count: 2,
      amountTranferred: 300000,
    })

    expect(Balance.getByAccountNumber(ACCOUNT_A, db)?.balanceCents).toBe(200000)
    expect(Balance.getByAccountNumber(ACCOUNT_B, db)?.balanceCents).toBe(400000)
  })

  it("handles a mix of valid, invalid, and rejected rows", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 500000 },
      { accountNumber: ACCOUNT_B, balanceCents: 100000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [
        { from: ACCOUNT_A, to: ACCOUNT_B, amount: 50000, rowNumber: 1 },
        { from: ACCOUNT_C, to: ACCOUNT_B, amount: 10000, rowNumber: 2 },
      ],
      invalid: [
        {
          rowNumber: 3,
          raw: { from: "bad", to: ACCOUNT_B, amount: "100" },
          errors: [{ path: "from", message: "invalid" }],
        },
      ],
    }

    const result = processTransactions(company.id, parsedCsv, db)

    expect(result.processedTransactions).toEqual({
      count: 1,
      amountTranferred: 50000,
    })
    expect(result.rejectedRows).toHaveLength(1)
    expect(result.invalidRows).toHaveLength(1)
  })

  it("creates a transfer batch with processed status on full success", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 500000 },
      { accountNumber: ACCOUNT_B, balanceCents: 100000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [{ from: ACCOUNT_A, to: ACCOUNT_B, amount: 10000, rowNumber: 1 }],
      invalid: [],
    }

    processTransactions(company.id, parsedCsv, db)

    const batch = db.select().from(transferBatches).all()
    expect(batch).toHaveLength(1)
    expect(batch[0].status).toBe("processed")
  })

  it("sets batch status to failed when all rows are rejected", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 100 },
      { accountNumber: ACCOUNT_B, balanceCents: 100000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [{ from: ACCOUNT_A, to: ACCOUNT_B, amount: 50000, rowNumber: 1 }],
      invalid: [],
    }

    processTransactions(company.id, parsedCsv, db)

    const batch = db.select().from(transferBatches).all()
    expect(batch[0].status).toBe("failed")
  })

  it("sets batch status to partially_processed with mixed results", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 500000 },
      { accountNumber: ACCOUNT_B, balanceCents: 100000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [
        { from: ACCOUNT_A, to: ACCOUNT_B, amount: 10000, rowNumber: 1 },
        { from: ACCOUNT_C, to: ACCOUNT_B, amount: 10000, rowNumber: 2 },
      ],
      invalid: [],
    }

    processTransactions(company.id, parsedCsv, db)

    const batch = db.select().from(transferBatches).all()
    expect(batch[0].status).toBe("partially_processed")
  })

  it("creates transaction records for successful transfers", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_A, balanceCents: 500000 },
      { accountNumber: ACCOUNT_B, balanceCents: 100000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [{ from: ACCOUNT_A, to: ACCOUNT_B, amount: 25000, rowNumber: 1 }],
      invalid: [],
    }

    processTransactions(company.id, parsedCsv, db)

    const txns = db.select().from(transactions).all()
    expect(txns).toHaveLength(1)
    expect(txns[0].amountCents).toBe(25000)
  })

  it("creates rejected transfer records in the database", () => {
    const company = seedCompanyAndAccounts(db, [
      { accountNumber: ACCOUNT_B, balanceCents: 100000 },
    ])

    const parsedCsv: ParsedCsv = {
      valid: [{ from: ACCOUNT_A, to: ACCOUNT_B, amount: 10000, rowNumber: 1 }],
      invalid: [],
    }

    processTransactions(company.id, parsedCsv, db)

    const rejected = db.select().from(rejectedTransfers).all()
    expect(rejected).toHaveLength(1)
    expect(rejected[0].accountNumberFrom).toBe(ACCOUNT_A)
    expect(rejected[0].accountNumberTo).toBe(ACCOUNT_B)
  })
})
