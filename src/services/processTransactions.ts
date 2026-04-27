import type { DbOrTx } from "../db/index.js"
import { type accounts, TransferBatchStatus } from "../db/tables.js"
import { Account } from "../models/Account.js"
import { Balance } from "../models/Balance.js"
import { RejectedTransfer } from "../models/RejectedTransfer.js"
import { Transaction } from "../models/Transaction.js"
import { TransferBatch } from "../models/TransferBatch.js"
import type { ErrorObject, ParsedCsv, ValidRow } from "../types/csv.js"

type RejectedRows = ErrorObject[]

const ErrorTypes = {
  ACCOUNT_NOT_FOUND: "account-not-found",
  BALANCE_BELOW_ZERO: "balance-below-zero",
} as const

/**
 * This will add an error to the error array returned to the user and create a rejected
 * transfer record
 *
 * @param transactionRow - row number from the CSV
 * @param errorType - the type of error it is ACCOUNT_NOT_FOUND | BALANCE_BELOW_ZERO
 * @param rejectedRows - the actual rejected row object
 * @param batchId - the id from the BatchTransfer record
 * @param tx - the transaction db connection
 */
function addError(
  transactionRow: ValidRow,
  errorType: string,
  rejectedRows: RejectedRows,
  batchId: number,
  tx: DbOrTx,
) {
  const { from, to, amount, rowNumber } = transactionRow
  const sharedError = {
    rowNumber,
    raw: { from, to, amount: amount.toString() },
  }
  switch (errorType) {
    case ErrorTypes.ACCOUNT_NOT_FOUND: {
      const message = `Cannot find account with accountNumber: ${from}`
      const error = {
        ...sharedError,
        errors: [
          {
            path: "from",
            message,
          },
        ],
      }
      rejectedRows.push(error)
      RejectedTransfer.create(transactionRow, message, batchId, tx)
      break
    }
    case ErrorTypes.BALANCE_BELOW_ZERO: {
      const message = "Account will go below zero with this transaction"
      const error = {
        ...sharedError,
        errors: [
          {
            path: "amount",
            message,
          },
        ],
      }
      rejectedRows.push(error)
      RejectedTransfer.create(transactionRow, message, batchId, tx)
      break
    }
    default:
      break
  }
}

type TransactionAccount = typeof accounts.$inferSelect

/**
 * Selects the correct account id for the correct account number
 *
 * @param transactionAccounts - a tuple of accountns that have made a transfer this transaction
 * @param fromAndTo - the account numbers for the transfers
 * @returns - the accountId for each from and to account
 */
function getAccountIds(
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

  return {
    fromAccountId,
    toAccountId,
  }
}

/**
 * Gets the batch status appropriate to what has been processed
 *
 * @param validRowsCount - count for valid rows to be processed
 * @param invalidRowsCount - count for invalid rows that didn't pass the parseAndValidateCsv step
 * @param rejectedRowsCount - count for rows that were rejected in the processTransactions step
 * @returns - the correct status for what has been process
 */
function getBatchStatus(
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

/**
 * This loops through the
 *
 * @param companyId
 * @param parsedCsv
 * @returns
 */
export function processTransactions(
  companyId: number,
  parsedCsv: ParsedCsv,
  db: DbOrTx,
) {
  const validRows = parsedCsv.valid

  console.info(
    `Processing ${validRows.length} transactions for company ${companyId}`,
  )
  // 0. Create batch record
  const { id: batchId } = TransferBatch.create(companyId, db)

  const rejectedRows: RejectedRows = []
  const processedTransactions = {
    count: 0,
    amountTranferred: 0,
  }
  db.transaction((tx) => {
    for (const validRow of validRows) {
      const { from, to, amount } = validRow

      // 1. Check if accounts exist
      const balanceFromAccount = Account.findWithBalance(from, tx)
      const balanceToAccount = Account.findWithBalance(to, tx)
      if (
        typeof balanceFromAccount === "undefined" ||
        typeof balanceToAccount === "undefined"
      ) {
        addError(
          validRow,
          ErrorTypes.ACCOUNT_NOT_FOUND,
          rejectedRows,
          batchId,
          tx,
        )
        continue
      }

      // 2. Check if balance of the from account goes below zero with transaction
      const balanceFromAccountAfterTransaction =
        balanceFromAccount.balances.balanceCents - amount
      const isBalanceBelowZero = balanceFromAccountAfterTransaction < 0
      if (isBalanceBelowZero) {
        addError(
          validRow,
          ErrorTypes.BALANCE_BELOW_ZERO,
          rejectedRows,
          batchId,
          tx,
        )
        continue
      }

      // 3. Update balance record and create transaction records
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
      const { fromAccountId, toAccountId } = getAccountIds(
        transactionAccounts,
        [from, to],
      )
      Transaction.create(fromAccountId, toAccountId, amount, batchId, tx)

      processedTransactions.count++
      processedTransactions.amountTranferred += amount
    }
  })

  // 4. Update transfer batch record to correct status
  const invalidRows = parsedCsv.invalid
  const batchStatus = getBatchStatus(
    validRows.length,
    invalidRows.length,
    rejectedRows.length,
  )
  TransferBatch.updateById(batchId, batchStatus, db)
  console.info(
    `Batch ${batchId} complete: status=${batchStatus}, processed=${processedTransactions.count}, rejected=${rejectedRows.length}, invalid=${invalidRows.length}`,
  )

  return {
    ...(processedTransactions.count > 0 && {
      processedTransactions: {
        ...processedTransactions,
        amountTranferred: (processedTransactions.amountTranferred / 100).toFixed(2),
      },
    }),
    invalidRows,
    rejectedRows,
  }
}
