# ADR-015: The finance engine is pure functions over one household's ledger

- Status: Accepted
- Date: 2026-10-05

## Context

Every figure the system shows or says comes from the finance engine. It has to be trustworthy in a way that can be demonstrated: reproducible, exhaustively testable, and free of any path by which a language model, a network call or the clock could change a number.

There were three questions to settle: where calculations run, how results express ratios, and how household isolation and currency separation are guaranteed.

## Decision

**Calculations are pure functions.** The engine's domain takes ledger entries, definitions and a reference date as arguments and returns plain values. It performs no I/O, reads no clock and holds no state. It does not import NestJS, Drizzle, the database driver or any AI SDK, and a lint rule fails the build if it does.

**Data is loaded, then calculated in memory.** `FinanceService` reads the entries of one household, in one currency, for the range a calculation needs, and passes them to the domain. Aggregation is not done in SQL.

**One household per call.** Every method of `FinanceService` requires a household identifier, and the only query that reads transactions filters by it. The domain never sees more than one household's entries, so it cannot combine two.

**One currency per calculation.** A calculation is given the currency it works in and throws if any entry is in another.

**Ratios are integer basis points.** Percentages, shares and rates are integers where 10 000 is 100%, computed with integer arithmetic. A ratio with a zero denominator is `null`.

**Thresholds live in one policy object** passed to the calculations that need them.

## Alternatives considered

**Aggregating in SQL** is faster for large data and would avoid loading rows. It would also split each calculation between SQL and TypeScript, make rounding rules depend on the database, and require a database for every test of financial logic. A household produces a few thousand transactions a year, which is trivial to hold in memory. If a calculation ever becomes slow, it can move to SQL behind the same method without changing its result type.

**Floating-point percentages** are what most interfaces display. They would bring `NaN`, `Infinity` and representation error into results that are otherwise exact, and would make threshold comparisons depend on rounding.

**A generic rules engine with stored rules** would allow thresholds to change without a release. Nothing requires that yet, and typed functions are easier to read, test and trust.

**Classes per calculator** injected through NestJS were the shape first sketched. Stateless functions need no container, and keeping the framework out of the domain is the point.

## Consequences

- The financial logic is covered by tests that run in milliseconds with no database.
- A result can be reproduced later from the same entries and reference date.
- The engine works with no AI provider and no messaging provider configured, because it cannot reach either.
- Consumers convert basis points for display. The conversion is a presentation concern.
- Memory use grows with the range loaded. The longest range any calculation loads is 400 days.
- Several methods load overlapping ranges when composed, as `insights` does. This costs a few extra queries per evaluation and keeps each method independent.
- Moving money between currencies, or totals across currencies, remains impossible until a conversion feature is designed.
