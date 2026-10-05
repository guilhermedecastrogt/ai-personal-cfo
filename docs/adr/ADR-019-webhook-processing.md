# ADR-019: Webhooks are claimed by message, acknowledged, then processed in the background

- Status: Accepted
- Date: 2026-10-05

## Context

Kapso delivers WhatsApp messages as webhooks. It expects HTTP 200 within ten seconds, retries twice otherwise, and pauses a webhook whose deliveries mostly fail. Handling a message involves at least two calls to a language model and sometimes a media download, which can take longer than ten seconds.

Kapso sends an `X-Idempotency-Key` with each delivery and recommends deduplicating on it. The key is stable across the retries of one delivery. When a batched delivery exhausts its retries, however, its messages are redelivered individually, and those deliveries carry new keys.

A message that is processed twice records a transaction twice and sends two replies. That is the failure this decision exists to prevent.

## Decision

**The event identity is the message.** An inbound message is recorded in `webhook_events` as `whatsapp.message.received:<message id>`. The delivery key is read and kept for tracing but is not the identity.

**Claiming is one atomic insert.** An event is claimed by inserting its row and ignoring a conflict on the unique key. The insert either returns a row, in which case this delivery owns the event, or returns nothing. No lock, cache or prior read is involved.

**Acknowledge after claiming, process afterwards.** The request is answered with 200 once its events are claimed. Processing continues in the same process. The response never depends on the outcome of processing.

**A claimed event is final.** It is never processed a second time, whether it ended as processed, ignored or failed, or was interrupted.

**One message at a time per sender.** Processing is queued per sender in memory, so a member's messages are handled in order.

## Alternatives considered

**Deduplicating on the delivery key**, as Kapso suggests, protects against retries of one delivery. It does not protect against the same message arriving under a new key.

**Processing before responding** is simpler and lets Kapso retry on failure. It would exceed the time limit on slow model calls, turn every slow response into a redelivery, and make duplicate processing the normal case under load.

**Releasing the claim on failure** so that a redelivery can try again sounds helpful and is dangerous: a failure after the transaction was written, for example while sending the reply, would cause the retry to record it again.

**A durable queue** would survive a crash between acknowledgement and completion. It would also be another service to run for a household's worth of messages. The event row left in `RECEIVED` records what was lost.

## Consequences

- A message is processed at most once, across retries, batches, redeliveries and simultaneous deliveries.
- Kapso always receives a fast response, so retries and auto-pause are triggered only by authentication or parsing failures.
- A crash between acknowledgement and completion loses that message. The member has to send it again, and the event remains visible as `RECEIVED`.
- A failed event is not retried. The member is told something went wrong.
- Ordering and in-flight work are held in memory, which ties the design to a single process. Running several instances would need the per-sender ordering to move into the database.
