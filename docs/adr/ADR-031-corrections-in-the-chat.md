# ADR-031: Corrections and deletions are applied from the chat

- Status: Accepted
- Refines: [ADR-021](ADR-021-structured-conversation-state.md), [ADR-029](ADR-029-dashboard-writes.md)
- Date: 2026-10-06

## Context

The assistant recognised corrections ("isso foi dia 1", "foram 45", "apaga esse") and declined them, sending the member to the dashboard. In real use that was the moment the assistant stopped feeling like an advisor: the member noticed a mistake a second after recording it and was told to open another app.

ADR-021 declined corrections because applying one means changing a financial record on the strength of a model's reading of a few words, and choosing which record is meant. The dashboard now edits and deletes through validated services ([ADR-029](ADR-029-dashboard-writes.md)), so the remaining question is how the chat chooses the record safely.

## Decision

**The model describes, the application chooses.**

- The model never sees transactions or identifiers.
- For a correction it returns the action (edit or delete), which transaction is meant in the member's own words (an ordinal, a merchant or category, an amount, a date, a member) and the new values.
- The application resolves that description against the transactions recorded through this conversation.

**The scope is this conversation, without identifiers in the state.**

- The transactions in scope are those whose source message is among the conversation's retained messages, the last 20.
- The state stores no transaction identifier. A pending deletion stores only the description and the version it was asked about.

**Ambiguity is asked, never guessed.**

- "isso" means the transaction recorded by the latest message.
- An ordinal counts within the latest message, in the order written.
- Filters apply to the latest message first, then to the whole conversation.
- More than one match makes the assistant list up to three and ask which.

**Edits apply at once; deletions ask first.**

- **Edit:**
  - Goes through the same service and validation as the dashboard.
  - Carries the version it read. A concurrent change is retried once on the current version.
- **Delete:**
  - Asks yes or no. The answer is read without the model.
  - The deletion is applied only if the transaction still has the version it had when asked. Any other message cancels it.

**Replies are deterministic**, like confirmations ([ADR-030](ADR-030-deterministic-confirmations.md)).

## Consequences

- Correcting a mistake takes one message, and the member sees the corrected record.
- A transaction recorded more than about ten messages ago, or by another member, is out of reach in the chat; the reply points to the dashboard.
- A correction misread by the model as a new transaction is still recorded as one. The confirmation always shows what was recorded.
