# Architecture Decision Records

Each record captures one significant decision: the context that forced it, what was decided, and what follows from it. Records are immutable once accepted. A decision that changes is superseded by a new record rather than edited.

| ADR                                                           | Decision                                                                                       | Status   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| [001](ADR-001-modular-monolith.md)                            | Modular monolith                                                                               | Accepted |
| [002](ADR-002-typescript-backend.md)                          | TypeScript backend on NestJS                                                                   | Accepted |
| [003](ADR-003-postgresql.md)                                  | PostgreSQL as the only data store                                                              | Accepted |
| [004](ADR-004-ai-output-validation.md)                        | AI output is validated before it reaches the domain                                            | Accepted |
| [005](ADR-005-openai-behind-provider-abstraction.md)          | OpenAI as the initial AI provider, behind an internal abstraction                              | Accepted |
| [006](ADR-006-household-and-members.md)                       | Household as the financial scope, members for attribution                                      | Accepted |
| [007](ADR-007-whatsapp-identity-resolution.md)                | Deterministic WhatsApp identity resolution                                                     | Accepted |
| [008](ADR-008-household-authorization-boundary.md)            | Household as the authorization boundary                                                        | Accepted |
| [009](ADR-009-transaction-attribution.md)                     | Transaction attribution and expense scope                                                      | Accepted |
| [010](ADR-010-household-budgets-and-goals.md)                 | Budgets and goals belong to the household                                                      | Accepted |
| [011](ADR-011-multi-household-multi-member.md)                | Any number of households, any number of members                                                | Accepted |
| [012](ADR-012-money-as-integer-minor-units.md)                | Money as integer minor units bound to a currency                                               | Accepted |
| [013](ADR-013-transfers-as-single-transaction.md)             | A transfer is one transaction between two accounts                                             | Accepted |
| [014](ADR-014-global-category-list.md)                        | Categories are a global controlled list created by migration                                   | Accepted |
| [015](ADR-015-pure-finance-engine.md)                         | The finance engine is pure functions over one household's ledger                               | Accepted |
| [016](ADR-016-task-level-ai-capabilities.md)                  | AIProvider exposes task-level capabilities, and questions become intents                       | Accepted |
| [017](ADR-017-account-resolution.md)                          | Accounts are resolved by rule, with a default account per member                               | Accepted |
| [018](ADR-018-temporary-media.md)                             | Media is fetched through an opaque reference and held only in a temporary directory            | Accepted |
| [019](ADR-019-webhook-processing.md)                          | Webhooks are claimed by message, acknowledged, then processed in the background                | Accepted |
| [020](ADR-020-deterministic-review-with-checked-narrative.md) | The monthly review is deterministic, and the model's narrative is checked against it           | Accepted |
| [021](ADR-021-structured-conversation-state.md)               | Conversations carry structured state, and the model never sees its earlier replies             | Accepted |
| [022](ADR-022-dashboard-sessions.md)                          | The dashboard signs in with member access codes and server-side sessions behind the web server | Accepted |
| [023](ADR-023-proactive-notifications.md)                     | Proactive notifications are decided by a deterministic policy over persistent event state      | Accepted |
| [024](ADR-024-derived-recurring-expenses.md)                  | Recurring expenses are derived from transactions on every read                                 | Accepted |
| [025](ADR-025-in-process-security-controls.md)                | Security controls run inside the application, with in-memory rate limiting                     | Accepted |
| [026](ADR-026-single-vm-compose-deployment.md)                | Production runs as a Compose stack on a shared VM, and Terraform does not own that VM          | Accepted |
| [027](ADR-027-per-household-display-language.md)              | Each household has a display language, and canonical names stay in English                     | Accepted |
