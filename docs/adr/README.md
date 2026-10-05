# Architecture Decision Records

Each record captures one significant decision: the context that forced it, what was decided, and what follows from it. Records are immutable once accepted. A decision that changes is superseded by a new record rather than edited.

| ADR                                                  | Decision                                                          | Status   |
| ---------------------------------------------------- | ----------------------------------------------------------------- | -------- |
| [001](ADR-001-modular-monolith.md)                   | Modular monolith                                                  | Accepted |
| [002](ADR-002-typescript-backend.md)                 | TypeScript backend on NestJS                                      | Accepted |
| [003](ADR-003-postgresql.md)                         | PostgreSQL as the only data store                                 | Accepted |
| [004](ADR-004-ai-output-validation.md)               | AI output is validated before it reaches the domain               | Accepted |
| [005](ADR-005-openai-behind-provider-abstraction.md) | OpenAI as the initial AI provider, behind an internal abstraction | Accepted |
| [006](ADR-006-household-and-members.md)              | Household as the financial scope, members for attribution         | Accepted |
| [007](ADR-007-whatsapp-identity-resolution.md)       | Deterministic WhatsApp identity resolution                        | Accepted |
| [008](ADR-008-household-authorization-boundary.md)   | Household as the authorization boundary                           | Accepted |
| [009](ADR-009-transaction-attribution.md)            | Transaction attribution and expense scope                         | Accepted |
| [010](ADR-010-household-budgets-and-goals.md)        | Budgets and goals belong to the household                         | Accepted |
| [011](ADR-011-multi-household-multi-member.md)       | Any number of households, any number of members                   | Accepted |
