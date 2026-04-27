import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { createDb } from "./db/index.js"
import {
  TransactionProcessor,
  TransactionProcessorError,
} from "./services/processTransactions.js"
import { parseAndValidateCsv } from "./utilities/parseAndValidateCsv.js"

const db = createDb()

const routes = new Hono()

routes.get("/api/v1/health-check", (c) => {
  return c.text("Hello Hono!")
})

routes.post("/api/v1/upload/transactions/:companyId", async (c) => {
  try {
    const body = await c.req.parseBody()
    const companyId = Number.parseInt(c.req.param("companyId"), 10)
    if (Number.isNaN(companyId)) {
      throw new HTTPException(400, { message: "Company ID must be a number" })
    }

    const file = body.file
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "File required" })
    }

    const isCsv = file.type === "text/csv"
    if (!isCsv) {
      throw new HTTPException(415, { message: "CSV file required" })
    }

    const csv = await file.text()
    const parsedCsv = parseAndValidateCsv(csv)
    const result = new TransactionProcessor(companyId, parsedCsv, db).run()
    return c.json(result)
  } catch (error: unknown) {
    console.error("Upload failed:", error)
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status)
    }
    if (error instanceof TransactionProcessorError) {
      return c.json({ error: error.message }, 404)
    }
    if (error instanceof Error) {
      return c.json({ error: error.message }, 500)
    }
  }
})

export { routes }
