import { Account } from "../models/Account.js"
import { Balance } from "../models/Balance.js"
import { Company } from "../models/Company.js"
import { createDb } from "./index.js"

const accountBalances = [
  { accountNumber: "1111234522226789", balanceCents: 500000 },
  { accountNumber: "1111234522221234", balanceCents: 1000000 },
  { accountNumber: "2222123433331212", balanceCents: 55000 },
  { accountNumber: "1212343433335665", balanceCents: 120000 },
  { accountNumber: "3212343433335755", balanceCents: 5000000 },
]

async function seed() {
  const db = createDb()

  const company = Company.create(
    `Company_${crypto.randomUUID().slice(0, 8)}`,
    db,
  )

  for (const { accountNumber, balanceCents } of accountBalances) {
    const account = Account.create(accountNumber, company.id, db)
    Balance.create(balanceCents, account.id, db)
  }

  console.log(
    `Seeded company "${company.name}" with ${accountBalances.length} accounts`,
  )
}

seed()
