# ADR-024: Recurring expenses are derived from transactions on every read

- Status: Accepted
- Date: 2026-10-05

## Context

Recurring expenses were detected by the finance engine as a by-product of the monthly review. Making them a first-class part of the product means tracking a commitment over time: when it was first seen, whether its price changed, whether it has stopped.

The schema has had a `recurring_expenses` table since the first migration, with a status of observed, confirmed or dismissed. The obvious design is to write detected commitments into it and update each row as new transactions arrive.

That design gives a household two descriptions of the same thing. A stored commitment says the price is 15.99 and the ledger says the last two charges were 17.99. Every write to the ledger, including a backdated one, would need the stored rows reconciled, and any missed reconciliation would produce a figure that disagrees with the transactions it claims to summarise.

## Decision

Recurring commitments are computed from the ledger each time they are needed. Nothing about a detected commitment is persisted.

- Detection, status, price changes, novelty and payers are pure functions of the household's transactions in one currency and a date.
- Lifecycle facts are expressed as dates of real transactions: a commitment is established on its third charge, a price took effect on the first charge at the new amount, a commitment stopped after its last charge.
- "New", "price changed" and "stopped" are reported for a fixed number of days from those dates, defined in the finance policy.
- What the household has already been told is not stored with the commitment. It is the notification state of [ADR-023](ADR-023-proactive-notifications.md), keyed by the same transaction dates.
- `recurring_expenses` is left untouched and unwritten. It remains available for commitments a household confirms or dismisses by hand.

No migration is introduced.

## Alternatives considered

- **Persisting detected commitments.** Rejected for the reconciliation problem above. It would also make the result of a question depend on when a background job last ran.
- **Persisting only a first-detected timestamp.** Rejected. The date of the third charge is as good a definition, is reproducible, and does not depend on when the system happened to look.
- **Dropping the table.** Rejected. It is harmless, and user-confirmed commitments are a plausible later need that it already fits.

## Consequences

- An answer about recurring expenses always agrees with the transactions, including after a backdated entry, because it is computed from them.
- The same question asked for a past date gives what was true then.
- Each read loads up to 1 200 days of a household's expenses in one currency. This is acceptable at household scale and would need an index-backed query or caching at a much larger one.
- There is no history of lifecycle events. Once the reporting window passes, a past price change is no longer shown.
- A household cannot yet correct a detection, for example to say two merchant names are the same subscription or that a detected pattern is not one. That needs the stored, user-owned records this decision leaves room for.
