# ADR-009: Transaction attribution and expense scope

- Status: Accepted
- Date: 2026-10-05

## Context

A household needs two different facts about an expense. The first is who paid: whose money left whose account. The second is who the expense was for: the household as a whole, such as rent or groceries, or one person, such as a personal purchase.

These are independent. One member paying the full rent is an individual payment of a household expense. Collapsing them into a single field would make contribution analysis, how much each member puts toward shared costs, impossible to add later without reinterpreting historical data.

Full expense splitting, with shares, settlements and balances owed between members, is a product in itself and is not needed yet.

## Decision

A transaction carries both facts as separate fields.

`member_id` is the member who paid the expense or received the income. It is mandatory. For a message it defaults to the sender. It is a different member only when the message names one explicitly and the application matches that name to a household member.

`expense_scope` states who the expense was for:

| Value        | Meaning                                              |
| ------------ | ---------------------------------------------------- |
| `HOUSEHOLD`  | A shared cost of the household. This is the default. |
| `INDIVIDUAL` | A cost attributable to the paying member alone.      |

`expense_scope` is an analytical classification. It has no effect on visibility or authorization, in line with [ADR-008](ADR-008-household-authorization-boundary.md). Every member sees every transaction regardless of its scope.

The resulting shape of a transaction:

```
id
household_id
member_id
account_id
type
amount
currency
merchant
description
category_id
expense_scope
transaction_date
payment_method
source
source_message_id
ai_confidence
created_at
updated_at
```

Who recorded a transaction is not stored on the transaction. It is recoverable from `source_message_id`, since the originating message has a resolved sender.

Splitting is not implemented. The path to it is an additional `transaction_allocations` table that assigns portions of a transaction's amount to members, with a constraint that the portions sum to the amount. A transaction without allocation rows keeps its current meaning, so existing data stays valid and the `transactions` table does not change.

## Consequences

- The system can report spending per member, combined spending, each member's share of a category, and how much each member paid toward household expenses.
- An extracted transaction always has a definite member, because attribution comes from identity resolution and not from the model.
- A single expense that is partly shared and partly individual cannot be represented until allocations exist. It has to be recorded as two transactions or classified by its dominant purpose.
- Scope is a judgement the user may need to correct. The default of `HOUSEHOLD` keeps the common case free of questions.
- Transfers between accounts carry a member but no meaningful scope. They are excluded from spending and contribution figures by their type.
