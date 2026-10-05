# ADR-029: The dashboard edits and deletes transactions, and manages budgets and goals

- Status: Accepted
- Refines: [ADR-022](ADR-022-dashboard-sessions.md), [ADR-025](ADR-025-in-process-security-controls.md)
- Date: 2026-10-05

## Context

The dashboard was read-only for financial data. A transaction recorded wrongly on WhatsApp, such as an income booked to the wrong member or a test entry, could only be fixed in the database. Budgets and goals could only be created by a script.

Members need to correct and remove their own records, and to plan, from the phone.

## Decision

**The dashboard API gains write routes**, all behind the same session guard and household boundary as the reads:

- `GET`, `PATCH` and `DELETE /dashboard/transactions/:key`;
- `POST /dashboard/budgets`, `GET`, `PATCH` and `DELETE /dashboard/budgets/:key`;
- `POST /dashboard/goals`, `GET`, `PATCH` and `DELETE /dashboard/goals/:key`.

**Keys are opaque and scoped to the household.**

- Rows in the transactions, budgets and goals views carry a `key`. It is the only identifier the API exposes, and the browser only sends it back.
- Every lookup, update and delete filters by the household of the session. A key from another household gets the same `404` as a key that does not exist.
- Members, accounts and categories in a request body are checked against the household. One from another household is refused as unknown.

**Validation stays in the services.**

- A transaction edit reuses the rules that apply when a transaction is recorded: account currency, category kind, transfer rules.
- An expense can become income and the reverse. A transfer cannot become anything else, and nothing can become a transfer.
- Amounts arrive as the text the member typed, such as `12,50` or `1.234,56`, and are read in the currency of the account, budget or goal. The browser never converts amounts.
- Budget and goal currencies must be the household currency or the currency of one of its accounts.

**Concurrent edits are detected, not merged.**

- An edit view carries a `version`, the record's last update time. An update applies only when the version still matches, otherwise it gets `409` with `{ code: "STALE" }`.
- Deletes take no version.

**Errors name the field.** A refused write gets `422` with `{ errors: [{ field, code }] }`. `400` is not used for this, because its body is replaced by a fixed message ([ADR-025](ADR-025-in-process-security-controls.md)).

**Deletes are permanent.**

- There is no soft delete. A "deleted" flag that one query forgets would corrupt totals silently.
- Deleting a budget suppresses its notifications that have not been sent yet.
- Each write is logged with its kind only, never the amount, merchant or name.

**Writes have their own rate limit**, 30 per minute per session, separate from the 240 reads.

## Consequences

- A deleted record cannot be restored from the application. The database backup is the only way back, so a backup is taken before deploying this.
- Totals, reviews, recurring expenses and notifications are derived from transactions on every request, so an edit is reflected everywhere without migration.
- Notifications already sent about a deleted budget remain in the history.
- Accounts still cannot be created or edited from the dashboard, and transactions are still recorded only on WhatsApp.
