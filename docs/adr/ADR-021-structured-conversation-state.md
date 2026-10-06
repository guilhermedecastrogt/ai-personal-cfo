# ADR-021: Conversations carry structured state, and the model never sees its earlier replies

- Status: Accepted. Corrections refined by [ADR-031](ADR-031-corrections-in-the-chat.md)
- Date: 2026-10-05
- Refines: [ADR-016](ADR-016-task-level-ai-capabilities.md)

## Context

Until now the interpreter was sent the last six messages of a conversation, from both sides, so that a reply to a clarifying question could be connected to the message before it. That was enough for one clarification.

Real conversations need more: "and last month?", "only restaurants", "why?". They also expose what was wrong with sending raw history. The assistant's own replies contain figures. A model that reads "you spent €800 on restaurants" in the history can repeat it, build on it, or read a transaction amount out of a clarifying question. Text the model wrote earlier was functioning as a source of financial facts.

## Decision

**The application keeps structured state.** Per conversation it stores the previous question as application concepts (intent, period reference, category name, account name, member scope), any transaction that is pending clarification, and the last outcome. The state contains no calculated figure and no identifier.

**The model is given that state, plus the sender's recent messages.** It is not given earlier assistant replies. Replies are stored and never sent back.

**Follow-ups are merged by the application.** The model fills in what the latest message states and lists which slots of the previous question to keep. A pure function merges the two. The model is told not to copy values forward itself.

**Pending transactions are completed by the application.** The stored candidate is merged with the fields the completing message states, and the full validation runs again.

**Every answer is recalculated.** A follow-up runs the finance engine again. State is never a cache of results.

**State is validated and bounded.** It is parsed against its schema on every read, its names are resolved against the household on every use, and it expires after thirty minutes.

**Corrections are recognised and declined.** The interpreter has a kind for a message that wants to change something already recorded. The application answers that it cannot, and changes nothing.

**One conversation per member and channel**, enforced by a unique key.

## Alternatives considered

**Keep sending raw history, with instructions not to reuse figures.** This relies on the model obeying, which is the kind of guarantee this project does not accept for numbers.

**Send raw history with figures redacted.** Stripping numbers from prose leaves sentences that mislead in other ways, and it does not give the model the one thing it needs, which is a precise statement of what the previous question was.

**Let the model return the complete follow-up question.** Simpler to describe, and it makes the model responsible for remembering the category and period correctly. Listing slots to inherit makes the carrying over deterministic and testable.

**Let the model call tools to look up the previous answer.** That is an agent loop, which this project has excluded.

**Apply corrections to the last transaction.** Useful, and it means mutating a financial record on a model's reading of a few words. It needs a design of its own.

## Consequences

- A figure in an earlier reply cannot influence a later answer, because no later request contains it.
- Follow-up behaviour is covered by unit tests of a pure function.
- The size of a request to the model is bounded regardless of how long a conversation runs.
- Only the immediately previous question can be followed up. Deeper references are not supported.
- The model cannot see how the assistant phrased a clarifying question. It sees what is still needed, which is the part that matters.
- A wrong slot list from the model yields a correct answer to a different question. The reply names what was answered.
- Conversation state is one more thing stored per member. It holds names, not amounts, and is short-lived.
