# ADR-013: A transfer is one transaction between two accounts

- Status: Accepted
- Date: 2026-10-05

## Context

Moving €500 from a current account to a savings account changes two balances and changes nothing about what the household earned or spent. If the movement is recorded as an expense, spending is overstated, budgets are consumed and the savings rate falls for money that was in fact saved.

## Decision

A transfer is a single row in `transactions` with type `TRANSFER`, a source in `account_id` and a destination in `transfer_account_id`.

The database enforces its shape:

- `transfer_account_id` is present if and only if the type is `TRANSFER`.
- The destination differs from the source.
- Both accounts belong to the transaction's household and hold the transaction's currency.
- A transfer has no category.

Because spending and income are selected by type and aggregated by category, a transfer cannot enter either figure. The rule is structural and does not depend on each calculation remembering to exclude transfers.

## Alternatives considered

**Two linked rows**, a withdrawal and a deposit, would make each account's history a simple list of its own rows. It would also allow one half to exist without the other, and every spending query would need to exclude the pair.

**Double-entry ledger postings** would generalise to any movement of value and make balances provable. It is the right model for accounting software and considerably more than a household tracker needs.

## Consequences

- An account's balance is its opening balance, plus income into it, minus expenses from it, minus transfers out, plus transfers in. Reading it involves both account columns.
- A transfer between a member's account and a joint account is visible as a movement, which later supports contribution analysis.
- A transfer that includes a fee has to be recorded as a transfer and a separate expense.
- Paying a credit card bill from a current account is a transfer to the card's account. The purchases made on the card are the expenses.
- Transfers to an account outside the household, such as a gift to someone else, are not transfers in this sense. They are expenses.
