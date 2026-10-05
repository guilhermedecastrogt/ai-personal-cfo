# ADR-003: PostgreSQL as the only data store

- Status: Accepted
- Date: 2026-10-05

## Context

The data is relational and financial: households, members, accounts, transactions, categories, budgets and goals, with reports built from aggregations over time, category and member. Correctness matters far more than throughput. The whole system must run on one small ARM64 machine.

Besides financial records, the system needs webhook idempotency, a record of conversations and a place to keep generated reports.

## Decision

PostgreSQL is the single data store, running as a container on the same machine with a persistent volume. It is not exposed outside the Compose network.

It is used for everything that needs to be remembered:

- **Financial records**, with integrity enforced in the schema: foreign keys, check constraints on amounts and enumerations, and composite keys that tie members to their household.
- **Idempotency**, through a unique constraint on the provider's event identifier in `webhook_events`. A duplicate delivery fails the insert, which is an atomic check that needs no separate lock or cache.
- **Money**, as `bigint` minor units beside a currency code. The `numeric` type is exact and would also work, but integers map directly to the representation used in application code and leave no room for scale mismatches.
- **Generated reports**, as structured `jsonb` documents alongside the relational data they were computed from.

Schema changes are made only through versioned SQL migrations committed to the repository.

## Alternatives considered

**SQLite** is simpler to operate and would handle the load. It was not chosen because its type system and constraint enforcement are looser, concurrent writes from webhook processing and the dashboard are more awkward, and PostgreSQL leaves row-level security available as a later safeguard between households.

**A document database** would fit conversation records but not the aggregations and integrity rules at the centre of the system.

**Redis for idempotency and caching** would add a service to run for a problem a unique constraint already solves. Nothing at this scale needs a cache.

**A managed database** would remove operational work, but adds cost and an external dependency to a project meant to run entirely on one free machine.

## Consequences

- One system to back up. A database dump captures the entire state of the application.
- Aggregations for dashboards and reports are plain SQL over indexed columns.
- The database shares a machine with the application, so a lost disk loses both. Off-machine backups are required and are part of the deployment guide.
- Operating PostgreSQL, including upgrades and backups, is the project's responsibility.
