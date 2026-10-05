# ADR-023: Proactive notifications are decided by a deterministic policy over persistent event state

- Status: Accepted
- Date: 2026-10-05

## Context

The assistant answers messages and the dashboard shows figures, but neither tells a household that something changed. The finance engine already produces insights with stable keys and severities. What is missing is a way to deliver them unprompted.

Unprompted messages carry risks that replies do not. A system that messages too often is muted. A system that sends the same warning on every evaluation is worse than one that sends none. A message sent twice because two processes ran at once, or because a provider call was retried, looks broken. And a model that decides what to send, or to whom, would be an agent acting on financial data with nobody asking it to.

The project also has no queue, no cache and no scheduler service, and does not want one.

## Decision

**Events come from the existing analysis.** A pure function turns the monthly analysis into candidate events. Each has a stable key derived from currency, kind, subject and period, a severity, and a level that rises only when the situation materially worsens. No new financial calculation is introduced.

**A pure policy decides.** `decideNotification` maps a candidate and the stored state for its key to NOTIFY or SUPPRESS, considering the severity threshold, whether the level rose, and a cooldown that only a critical event bypasses. `deliveryHold` applies quiet hours in the household's time zone and a daily limit per household. Neither touches the database, the clock or the model.

**State is persistent and constrained.** `proactive_notifications` has one row per household and event key. `notification_deliveries` has one row per notification, member, channel and level. Both writes that matter are conditional on a unique key: creating an event, and claiming a delivery before sending. Correctness under repetition and concurrency rests on these constraints, not on the scheduler.

**Delivery is at most once.** A delivery is claimed before the provider is called. A failed send is retried by later runs up to a fixed number of attempts. A send whose outcome is unknown is not retried.

**Channels are behind an interface.** The proactive module depends on `NotificationChannel`, which lists a household's recipients and delivers a text to a member. The WhatsApp adapter lives in the `whatsapp` module, resolves addresses within the household, and calls the existing `WhatsAppProvider`. Provider code stays where [ADR-019](ADR-019-webhook-processing.md) left it.

**Recipients are the household.** Every reachable member receives the household's notifications, in line with [ADR-008](ADR-008-household-authorization-boundary.md) and [ADR-011](ADR-011-multi-household-multi-member.md). There is no per-member targeting.

**The model only phrases.** When enabled, the composer asks the model to word a notification from its title and detail, and checks the result with the figure guard of [ADR-020](ADR-020-deterministic-review-with-checked-narrative.md). Any failure falls back to the deterministic text. The model cannot affect whether, when or to whom a notification is sent.

**Scheduling is a lease plus a trigger.** An evaluation run takes a row in `evaluation_leases` with an expiry. An opt-in in-process timer and a command for an external scheduler both call the same trigger. Either can be used, or both.

## Alternatives considered

- **A job queue or Redis lock.** Rejected. PostgreSQL's unique constraints and one lease row give the same guarantees at this scale without a second data store, in line with [ADR-003](ADR-003-postgresql.md).
- **Evaluating after each recorded transaction.** Rejected for now. It ties notification latency to message handling and does nothing for events that arise from the passage of time, such as a forecast or a charge coming due. A periodic evaluation covers both.
- **Reusing the `insights` table.** Rejected. Its type enumeration and payload column were designed for a different shape, and changing them would rewrite an earlier migration's intent. The table is left as it is.
- **Letting the model choose what to mention.** Rejected. Eligibility has to be testable and repeatable.
- **Per-member preferences.** Deferred. One policy is enough to learn whether the defaults are right.

## Consequences

- Evaluating twice, concurrently, or after a restart sends nothing new. This is enforced by the database and covered by tests against PostgreSQL.
- A household receives a bounded number of non-critical messages a day and none at night. Critical events are exempt from both limits.
- A worsening situation is reported again, but no sooner than the cooldown allows unless it is critical.
- A crash between claiming a delivery and the provider's answer loses that message. The record remains on the dashboard.
- Adding a channel means implementing `NotificationChannel`. Sending through several channels at once would need the service to hold a list of them.
- The periodic evaluation recomputes each household's month. With many households this would need batching or evaluation on change.
- Low-severity events are stored and shown on the dashboard, so the table grows with every distinct event. Rows are small and keyed by period.
