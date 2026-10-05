# ADR-017: Accounts are resolved by rule, with a default account per member

- Status: Accepted
- Date: 2026-10-05

## Context

Every transaction belongs to an account, and most messages do not mention one: "Gastei €23 no Lidl". A household has several accounts, some personal and some joint.

Two bad options present themselves. Letting the model pick an account means a guess that silently corrupts balances. Asking which account on every message makes the assistant tiresome enough that nobody would use it.

## Decision

The model reports only the account name a member wrote, if they wrote one. The application resolves the account with a fixed rule:

1. A named account resolves to the account with that exact name, otherwise to the single account whose name contains it. When several match, the one owned by the sender is used. If more than one still matches, the member is asked.
2. With no account named, the sender's default account is used.
3. With no default, the household's only account is used when there is exactly one.
4. Otherwise the member is asked and shown the accounts.

A member's default account is stored in `member_default_accounts`, one row per member. Both the member and the account are tied to the same household by composite foreign keys.

When no currency is stated, the transaction takes the currency of the resolved account. When a currency is stated and differs from the account's, the member is asked. Nothing is converted.

## Alternatives considered

**A default account column on `members`** would be simpler to read. It would also make `members` and `accounts` reference each other, and accounts are owned by a different module. A separate table keeps the dependency pointing one way.

**Inferring the account from the payment method or merchant**, for example treating card payments as coming from a card account, is a guess with a rule's clothing. It can be reconsidered when there is data showing it would be right.

**Remembering the last account used** changes behaviour invisibly from one message to the next.

## Consequences

- A member who sets a default is never asked for an account unless they name one that is ambiguous.
- A household with a single account needs no setup.
- A member without a default in a household with several accounts is asked every time, until a default is set. Defaults are set by seeding for now. There is no command for changing one yet.
- The rule is deterministic and testable, and the same message from the same member always resolves the same way.
