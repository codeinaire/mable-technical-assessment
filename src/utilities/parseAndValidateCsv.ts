import z from "zod"
import type { ParsedCsv } from "../types/csv.js"

export const ValidTransaction = z.strictObject({
  from: z.string().regex(/^\d{16}$/, "16-digit account number required"),
  to: z.string().regex(/^\d{16}$/, "16-digit account number required"),
  amount: z
    .string()
    .regex(
      /^\d+(\.\d{1,2})?$/,
      "amount must be a positive number with up to 2 decimal places",
    )
    .transform((s) => Math.round(parseFloat(s) * 100))
    .refine((cents) => cents > 0, "amount must be greater than 0"),
})

/**
 * This validates and transforms the csv string. If valid it'll go into the valid array and be
 * processed and if any fields are invalid it'll go into the invalid array and not be processed
 * but be sent back to the user
 *
 * @param csv - the csv string
 * @returns
 */
export function parseAndValidateCsv(csv: string): ParsedCsv {
  const rows = csv.split(/\r?\n/).filter(Boolean)

  return rows.reduce(
    (acc: ParsedCsv, row: string, index: number) => {
      const [from, to, amount] = row.split(",")
      const rowNumber = index + 1

      const validatedRow = ValidTransaction.safeParse({ from, to, amount })

      if (validatedRow.success) {
        acc.valid.push({ ...validatedRow.data, rowNumber })
      } else {
        const invalidRow = {
          rowNumber,
          raw: { from, to, amount },
          errors: validatedRow.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        }
        acc.invalid.push(invalidRow)
      }
      return acc
    },
    {
      valid: [],
      invalid: [],
    },
  )
}
