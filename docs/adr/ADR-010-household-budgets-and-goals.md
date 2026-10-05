# ADR-010: Budgets and goals belong to the household

- Status: Accepted
- Date: 2026-10-05

## Context

A couple that shares its finances plans at the level of the household: one restaurant budget, one emergency fund. Budgets or goals per member would have to be reconciled into a household view that nobody set directly, and would raise the question of whose budget a shared dinner counts against.

The household still wants to know how each member contributed to a budget's usage or a goal's progress.

## Decision

Budgets and goals are owned by the household and carry `household_id`. Neither has a member owner.

**Budgets.** A budget is a limit and an alert threshold for a category over a period. Usage is computed by the finance engine from every household transaction in that category and period, whoever paid. The per-member breakdown is derived from transaction attribution ([ADR-009](ADR-009-transaction-attribution.md)) and is never stored:

```
Restaurants, monthly limit €300
  Member A      €180
  Member B       €90
  Household     €270
  Remaining      €30
```

Alerts are evaluated against the household total only. There are no per-member limits.

**Goals.** A goal has a name, a type, a target amount, a current amount and an optional deadline. Progress, the required saving rate and deadline risk are computed on household totals.

Per-member contributions to a goal are not tracked in the first version. The extension path is a `goal_contributions` table recording member, amount and date, at which point `current_amount` becomes the sum of contributions. Introducing it does not alter the `goals` table's meaning.

## Consequences

- Budget alerts and goal warnings speak about the household, which matches how the limits were set, while explanations can still name each member's part of a budget.
- Per-member budget breakdowns cost nothing to maintain because they are computed, and they cannot drift from the transactions.
- A member cannot have a private allowance or a personal goal. Both would need a deliberate extension of the model.
- Until contributions are tracked, the system can state a goal's total progress but not each member's share of it.
