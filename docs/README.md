# Documentation

Documents are added as the corresponding part of the system is built.

| Document                                             | Purpose                                                                 | Status                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| [`architecture.md`](architecture.md)                 | System structure, module boundaries and data flow                       | Written                                 |
| [`development.md`](development.md)                   | Local setup, commands and conventions                                   | Written                                 |
| [`database.md`](database.md)                         | Schema, constraints and migration workflow                              | Written                                 |
| [`finance-engine.md`](finance-engine.md)             | Calculations, methodologies and thresholds                              | Written                                 |
| [`ai-integration.md`](ai-integration.md)             | Provider abstraction, extraction, intents, validation and authorization | Written                                 |
| [`vision-extraction.md`](vision-extraction.md)       | Image flow, temporary storage, validation and limitations               | Written                                 |
| [`whatsapp-integration.md`](whatsapp-integration.md) | Webhook flow, Kapso adapter, idempotency and identity resolution        | Written                                 |
| [`cfo-intelligence.md`](cfo-intelligence.md)         | Monthly review, findings, model context and the numeric-truth check     | Written                                 |
| [`conversation.md`](conversation.md)                 | Multi-turn conversations, follow-ups, trusted and untrusted context     | Written                                 |
| `deployment.md`                                      | Oracle Cloud provisioning and release process                           | Planned                                 |
| [`adr/`](adr/README.md)                              | Architecture decision records                                           | Written, extended as decisions are made |

## Conventions

Source code carries no explanatory comments. Reasoning about why the system is built the way it is belongs here, and significant decisions are recorded as ADRs so the context behind them is not lost.
