# Mable Backend Assessment

## Setup

```bash
npm install
cp .env.example .env   # set DATABASE_URL
npm run db:setup        # creates db-file/, runs migrations, and seeds
```

## Run

```bash
npm run dev
```

## API

### Health check

```bash
curl http://localhost:3000/api/v1/health-check
```

### Upload transactions

```bash
curl -F "file=@./mable_transactions.csv;type=text/csv" http://localhost:3000/api/v1/upload/transactions/1
```

The CSV format is `from,to,amount` with no header row:

```
1111234522226789,1212343433335665,500.00
```

- `from` / `to` must be 16-digit account numbers
- `amount` must be positive with up to 2 decimal places
- Transactions that would bring a balance below zero are rejected

## Tests

```bash
npm run test:run              # all tests
npx vitest run --project unit        # unit only
npx vitest run --project integration # integration only
```

Integration tests require migrations: `npx drizzle-kit generate` before first run.

## Database Commands

```bash
npm run db:setup   # creates db-file/, runs migrations, and seeds
npm run db:reset   # deletes db and migrations, then runs setup fresh
npm run db:migrate # generates and applies migrations
npm run db:seed    # seeds initial data
```

To inspect the database directly:

```bash
sqlite3 ./db-file/mable-backend-assessment-prod.db
```

Useful SQLite commands:

```
.tables                        -- list all tables
SELECT * FROM accounts;        -- view accounts
SELECT * FROM balances;        -- view balances
.quit                          -- exit
```

## Notes

- The SQLite package `better-sqlite3` is synchronous (hence no use of async/await), single-connection.
- Zod is used for validation and some typing
- Drizzle is used as the ORM and some typing
