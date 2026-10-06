# ADR-030: Recorded transactions are confirmed without the model

- Status: Accepted
- Refines: [ADR-020](ADR-020-deterministic-review-with-checked-narrative.md)
- Date: 2026-10-06

## Context

Every message made two sequential calls to the model: one to interpret it and one to phrase the reply. In production a message took 10 to 25 seconds, half of it spent phrasing "recorded" in a sentence the system already knew.

The phrased confirmations also drifted. They ended with offers the system could not act on ("Do you want me to change anything?"), so the member's "no" that followed had nothing to answer. They mixed European and Brazilian Portuguese, and commented on information that was simply absent.

## Decision

**A recorded transaction is confirmed by the application.**

- The confirmation is built from the saved row: amount formatted by the money module, merchant, category label in the household's language, account, the member when it is not the sender, and the date.
- It is one short message in the household's language and never ends with a question, for example `Registrado: € 22,75 em Five Guys (Restaurantes), conta Revolut Bia, para Beatriz, em 01/10.`
- The model is not called for it, so a model failure cannot affect it.

**The model still phrases everything that benefits from language**: answers to questions, clarifications, image problems, the welcome and messages out of scope. For those:

- the household's language is passed explicitly, with Brazilian Portuguese spelled out;
- offers to do more are forbidden, and a closing question is removed from every reply except clarifications and the welcome.

**Bare yes and no are answered without the model** when what they answer is known.

**Reasoning effort is configured.** `OPENAI_REASONING_EFFORT` sets `reasoning.effort` on every call, `low` by default. `off` leaves it out for a model that does not reason.

## Consequences

- A recorded transaction costs one model call instead of two.
- Confirmations are uniform. They read as a precise record rather than a varied sentence, which suits a financial assistant.
- Changing the wording of a confirmation is a code change in `conversation/replies/deterministic-replies.ts`, not a prompt change.
