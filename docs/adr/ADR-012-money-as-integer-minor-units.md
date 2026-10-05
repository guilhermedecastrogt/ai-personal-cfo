# ADR-012: Money as integer minor units bound to a currency

- Status: Accepted
- Date: 2026-10-05

## Context

JavaScript has one numeric type for everyday use, and it is binary floating point. `0.1 + 0.2` is not `0.3`. A finance system that holds €43.27 as `43.27` will eventually store or report a wrong cent.

Amounts also mean nothing without a currency, and the system must never add euros to reais or convert between them without an explicit feature for doing so.

## Decision

**Representation.** A monetary amount is an integer count of the currency's minor unit, held with its ISO 4217 code. €43.27 is `4327` and `EUR`.

- In PostgreSQL the amount is a `bigint` column whose name ends in `_minor`, next to a `currency` column constrained to three upper-case letters.
- In TypeScript the amount is a `number` that must be a safe integer. Integers are exact in a `number` up to 2^53, which is far beyond any household amount, and unlike `bigint` they serialise to JSON without special handling.
- Decimal text such as `"43.27"` is converted by string manipulation and integer arithmetic. It never passes through a floating-point value. Text with more decimal places than the currency has is rejected, not rounded.
- The number of minor unit digits per currency comes from the platform's ISO 4217 data, so yen has none and euro has two without a table in this codebase.

**Currency binding.** A transaction's currency must equal the currency of its account. The foreign key from `transactions` to `accounts` includes the currency column, so the database enforces it. A transfer references both of its accounts the same way and can therefore only connect accounts in the same currency.

**Sign.** Transaction amounts are always positive. Whether money left or arrived is determined by the transaction type.

## Alternatives considered

**PostgreSQL `numeric`** is exact and would work in the database. It arrives in JavaScript as a string, which would need a decimal library for every calculation and would leave the scale of each value as something to get wrong.

**A decimal library throughout** adds a dependency to every calculation for no benefit over integers when no conversion or interest calculation exists.

**TypeScript `bigint`** removes the upper bound but does not serialise to JSON and cannot be mixed with `number` in arithmetic. The bound is not a practical constraint.

## Consequences

- Sums and differences are exact integer operations.
- Division, as in percentages and averages, produces fractions and needs an explicit rounding rule wherever it occurs. That belongs to the finance engine.
- A purchase made abroad from a euro account is recorded as the euro amount that left the account. The foreign amount is not captured until a conversion feature exists.
- A transfer between accounts in different currencies cannot be recorded as a transfer. It needs an exchange rate, which is out of scope.
- An account's currency cannot be changed once it has transactions.
- Amounts in different currencies within a household stay separate in every total.
