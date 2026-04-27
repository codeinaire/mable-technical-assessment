import type z from "zod"
import type { ValidTransaction } from "../utilities/parseAndValidateCsv.js"

export type ValidRow = z.infer<typeof ValidTransaction> & {
  rowNumber: number
}

export interface ErrorObject {
  rowNumber: number
  raw: z.input<typeof ValidTransaction>
  errors: { path: string; message: string }[]
}

export interface ParsedCsv {
  valid: ValidRow[]
  invalid: ErrorObject[]
}
