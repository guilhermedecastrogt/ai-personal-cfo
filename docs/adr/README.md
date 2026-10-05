# Architecture Decision Records

Each record captures one significant decision: the context that forced it, what was decided, and what follows from it. Records are immutable once accepted. A decision that changes is superseded by a new record rather than edited.

| ADR | Decision | Status |
| --- | --- | --- |
| 001 | Modular monolith | Planned |
| 002 | TypeScript backend | Planned |
| 003 | PostgreSQL | Planned |
| 004 | AI output validation | Planned |
| [005](ADR-005-openai-behind-provider-abstraction.md) | OpenAI as the initial AI provider, behind an internal abstraction | Accepted |
| [006](ADR-006-household-and-members.md) | Household as the financial scope, members for attribution | Accepted |
| [007](ADR-007-whatsapp-identity-resolution.md) | Deterministic WhatsApp identity resolution | Accepted |
| [008](ADR-008-household-authorization-boundary.md) | Household as the authorization boundary | Accepted |
| [009](ADR-009-transaction-attribution.md) | Transaction attribution and expense scope | Accepted |
| [010](ADR-010-household-budgets-and-goals.md) | Budgets and goals belong to the household | Accepted |

Numbers 001 to 004 are reserved for the foundational decisions written alongside the architecture document.
