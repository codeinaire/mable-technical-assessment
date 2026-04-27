# Draft Design - not complete

# Use Cases

Bank - company
Companies - can be a customer as well

Use cases
- Company must be able to upload CSV with transfers they want to make between accounts
- Transfers of the amount will happen between the accounts in the uploaded CSV
- Transfers cannot proceed if the account balance goes below 0.

# Entities

Company
  id
  name

Account
  id
  account_number
  company_id: FK Company (many-to-one)
  created_at
  updated_at

Balance
  id
  current_balance_cents
  account_id: FK Account one-to-one
  created_at
  updated_at

Transaction - append and read only
  id
  amount_cents: integer
  transferred_to: FK Account (many-to-one)
  transferred_from: FK Account (many-to-one)
  batch_id: FK TransferBatch (many-to-one)
  created_at

TransferBatch
  id
  company_id: FK Company (many-to-one)
  uploaded_at
  status: enum(pending, processed, partially_processed, failed)
  created_at

RejectedTransfer
  id
  batch_id: FK TransferBatch (many-to-one)
  transferred_from FK Account (many-to-one)
  transferred_to FK Account (many-to-one)
  row_number
  amount_cents
  reason: enum (insufficient_funds, account_not_found, ...)
  created_at

# Models

Company.create/find
Account.create/find
Balance.upsert/find
Transaction.create/find
TransferBatch.upsert/find
RejectedTransfer.create/find

# Service

# API

/upload/:id

# Dataflow

Upload file
Parse csv and validate
Create a TransferBatch record and set as pending
Loop through rows - run the db queries in a transaction
- Get to (addition) and from (subtraction) values an convert to integers
  - check only two decimal places and if so multiple by 100 to get integer
- Get both accounts
- Check the "from" account balance to see if they have enough money
  - if show an error and create a RejectTransfer record
  - set the TransferBatch as partially_processed
- Add to the "to" account and subtract from the "from" account Balance record
- Create a transaction record

# Tests

- Transfers successfully
- Doesn't transfer if not enough balance
- Validation tests for the CSV parser
  - happy path
  - account number length
  - amount is float
  - empty input
- Integration tests
  - happy path
  - accounts not found
  - balance goes under zero
  - valid and invalid rows
