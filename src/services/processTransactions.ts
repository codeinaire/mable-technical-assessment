import type { DbOrTx } from "../db/index.js"
import { type accounts, TransferBatchStatus } from "../db/tables.js"
import { Account } from "../models/Account.js"
import { Balance } from "../models/Balance.js"
import { Company } from "../models/Company.js"
import { RejectedTransfer } from "../models/RejectedTransfer.js"
import { Transaction } from "../models/Transaction.js"
import { TransferBatch } from "../models/TransferBatch.js"
import type { ErrorObject, ParsedCsv, ValidRow } from "../types/csv.js"

type RejectedRows = ErrorObject[]
type TransactionAccount = typeof accounts.$inferSelect

const ErrorTypes = {
  ACCOUNT_NOT_FOUND: "account-not-found",
  BALANCE_BELOW_ZERO: "balance-below-zero",
} as const

export class TransactionProcessorError extends Error {
  name = "TransactionProcessorError"
}

export class TransactionProcessor {
  private readonly db: DbOrTx
  private readonly companyId: number
  private readonly parsedCsv: ParsedCsv
  private readonly rejectedRows: RejectedRows = []
  private readonly processedTransactions = {
    count: 0,
    amountTranferred: 0,
  }
  private batchId!: number

  constructor(companyId: number, parsedCsv: ParsedCsv, db: DbOrTx) {
    this.companyId = companyId
    this.parsedCsv = parsedCsv
    this.db = db
  }

  /**
   * Checks if company exists and throws an error if it doesn't
   * If it does creates transfer batch record to track the upload, runs the valid rows
   * in loop in a transaction, updates transfer batch record, and returns summary of
   * transaction process
   *
   * @returns
   */
  run() {
    const validRows = this.parsedCsv.valid

    console.info(
      `Processing ${validRows.length} transactions for company ${this.companyId}`,
    )

    const company = Company.findById(this.companyId, this.db)
    if (typeof company === "undefined") {
      throw new TransactionProcessorError("Company does not exist")
    }

    // 0. Create batch record
    this.batchId = TransferBatch.create(this.companyId, this.db).id

    // 1. Process each valid row in a transaction
    this.db.transaction((tx) => {
      for (const validRow of validRows) {
        this.processRow(validRow, tx)
      }
    })

    // 2. Update transfer batch record to correct status
    const invalidRows = this.parsedCsv.invalid
    const batchStatus = this.getBatchStatus(
      validRows.length,
      invalidRows.length,
      this.rejectedRows.length,
    )
    TransferBatch.updateById(this.batchId, batchStatus, this.db)
    console.info(
      `Batch ${this.batchId} complete: status=${batchStatus}, processed=${this.processedTransactions.count}, rejected=${this.rejectedRows.length}, invalid=${invalidRows.length}`,
    )

    const amountTranferred = (
      this.processedTransactions.amountTranferred / 100
    ).toFixed(2)

    return {
      ...(this.processedTransactions.count > 0 && {
        processedTransactions: {
          ...this.processedTransactions,
          amountTranferred,
        },
      }),
      invalidRows,
      rejectedRows: this.rejectedRows,
    }
  }

  /**
   * This checks if account exists, check if balance goes below zero, and, if it does, updates
   * balance, creates transaction, and update processed transaction count
   * If account doesn't exist and/or balance is below zero an error object is added to the rejected
   * errors array
   *
   * @param validRow - a parsed and validated rows
   * @param tx - transaction db object
   */
  private processRow(validRow: ValidRow, tx: DbOrTx) {
    const { from, to, amount } = validRow

    // Check if accounts exist
    const balanceFromAccount = Account.findWithBalance(from, tx)
    const balanceToAccount = Account.findWithBalance(to, tx)
    if (
      typeof balanceFromAccount === "undefined" ||
      typeof balanceToAccount === "undefined"
    ) {
      this.addError(validRow, ErrorTypes.ACCOUNT_NOT_FOUND, tx)
      return
    }

    // Check if balance of the from account goes below zero
    const balanceFromAccountAfterTransaction =
      balanceFromAccount.balances.balanceCents - amount
    if (balanceFromAccountAfterTransaction < 0) {
      this.addError(validRow, ErrorTypes.BALANCE_BELOW_ZERO, tx)
      return
    }

    // Update balances and create transaction record
    Balance.update(
      balanceFromAccount.accounts.id,
      balanceFromAccountAfterTransaction,
      tx,
    )

    const balanceToAccountAfterTransaction =
      balanceToAccount.balances.balanceCents + amount
    Balance.update(
      balanceToAccount.accounts.id,
      balanceToAccountAfterTransaction,
      tx,
    )

    const transactionAccounts = Account.findByAccountNumbers([from, to], tx)
    const { fromAccountId, toAccountId } = this.getAccountIds(
      transactionAccounts,
      [from, to],
    )
    Transaction.create(fromAccountId, toAccountId, amount, this.batchId, tx)

    this.processedTransactions.count++
    this.processedTransactions.amountTranferred += amount
  }

  /**
   * This will add an error to the error array returned to the user and create a rejected
   * transfer record
   *
   * @param transactionRow - row number from the CSV
   * @param errorType - the type of error it is ACCOUNT_NOT_FOUND | BALANCE_BELOW_ZERO
   * @param tx - the transaction db connection
   */
  private addError(transactionRow: ValidRow, errorType: string, tx: DbOrTx) {
    const { from, to, amount, rowNumber } = transactionRow
    const sharedError = {
      rowNumber,
      raw: { from, to, amount: amount.toString() },
    }
    switch (errorType) {
      case ErrorTypes.ACCOUNT_NOT_FOUND: {
        const message = `Cannot find account with accountNumber: ${from}`
        this.rejectedRows.push({
          ...sharedError,
          errors: [{ path: "from", message }],
        })
        RejectedTransfer.create(transactionRow, message, this.batchId, tx)
        break
      }
      case ErrorTypes.BALANCE_BELOW_ZERO: {
        const message = "Account will go below zero with this transaction"
        this.rejectedRows.push({
          ...sharedError,
          errors: [{ path: "amount", message }],
        })
        RejectedTransfer.create(transactionRow, message, this.batchId, tx)
        break
      }
      default:
        break
    }
  }

  /**
   * Selects the correct account id for the correct account number
   *
   * @param transactionAccounts - a tuple of accounts that have made a transfer this transaction
   * @param fromAndTo - the account numbers for the transfers
   * @returns - the accountId for each from and to account
   */
  private getAccountIds(
    transactionAccounts: TransactionAccount[],
    fromAndTo: [string, string],
  ) {
    const [accountOne, accountTwo] = transactionAccounts
    const [accountNumberOne, accountNumberTwo] = fromAndTo
    const fromAccountId =
      accountOne.accountNumber === accountNumberOne
        ? accountOne.id
        : accountTwo.id
    const toAccountId =
      accountTwo.accountNumber === accountNumberTwo
        ? accountTwo.id
        : accountOne.id

    return { fromAccountId, toAccountId }
  }

  /**
   * Gets the batch status appropriate to what has been processed
   *
   * @param validRowsCount - count for valid rows to be processed
   * @param invalidRowsCount - count for invalid rows that didn't pass the parseAndValidateCsv step
   * @param rejectedRowsCount - count for rows that were rejected in the processTransactions step
   * @returns - the correct status for what has been process
   */
  private getBatchStatus(
    validRowsCount: number,
    invalidRowsCount: number,
    rejectedRowsCount: number,
  ) {
    const sumTotalErrorRows = invalidRowsCount + rejectedRowsCount
    const isCompleteFailure =
      validRowsCount === invalidRowsCount ||
      validRowsCount === rejectedRowsCount ||
      validRowsCount === sumTotalErrorRows
    if (isCompleteFailure) {
      return TransferBatchStatus.FAILED
    }

    const isPartialFailure = invalidRowsCount > 0 || rejectedRowsCount > 0
    if (isPartialFailure) {
      return TransferBatchStatus.PARTIALLY_PROCESSED
    }

    return TransferBatchStatus.PROCESSED
  }
}
