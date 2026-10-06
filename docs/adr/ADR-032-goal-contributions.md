# ADR-032: Goals receive contributions linked to transactions

- Status: Accepted
- Refines: [ADR-010](ADR-010-household-budgets-and-goals.md)
- Date: 2026-10-06

## Context

A household uses goals for more than savings: a trip being paid for, a debt being repaid. The member wants to say "count this payment toward the Malta trip" in the chat, right after recording it. The goal's current amount was a single number typed in the dashboard, with no history and no link to what moved it.

ADR-010 named the extension path: a `goal_contributions` table recording member, amount and date.

## Decision

**Contributions are records.** `goal_contributions` stores the goal, the member, the amount and currency, the date and, optionally, the transaction it came from.

- Composite keys keep every reference inside the household. The key to the goal includes its currency, so a contribution is always in the goal's currency.
- A transaction counts toward a goal at most once.
- The key to the transaction restricts its deletion, so a transaction cannot disappear while it still counts toward a goal.

**The goal keeps a stored total.** `current_amount_minor` stays what the finance engine reads. A contribution increases it in the same database transaction that records it. This departs from ADR-010's "the current amount becomes the sum of contributions", because the dashboard still sets the amount by hand and that edit must remain absolute.

**Linked transactions stay consistent.**

- Deleting a linked transaction removes its contribution and subtracts it from the goal, in the same database transaction. This covers the dashboard and the chat, because both delete through the same service.
- Changing a linked transaction's amount adjusts the contribution and the goal by the difference.
- Moving a linked transaction to another currency is refused.
- A goal with contributions cannot change currency. Deleting a goal deletes its contributions.

**The product speaks of progress, not savings.** A contribution can be money set aside, a payment toward a trip or the repayment of a debt. Dashboard labels and replies say "progress" and "remaining" rather than "saved".

## Consequences

- "Contabilize esse valor na meta" works from the chat, and the reply shows the goal's progress from the finance engine.
- A goal's total is no longer guaranteed to equal the sum of its contributions, because the dashboard can set it by hand. Subtracting a contribution never takes it below zero.
- Per-member contributions are now recorded, which a later view can show.
