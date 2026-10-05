# ADR-016: AIProvider exposes task-level capabilities, and questions become intents

- Status: Accepted
- Date: 2026-10-05
- Refines: [ADR-005](ADR-005-openai-behind-provider-abstraction.md)

## Context

ADR-005 placed OpenAI behind an `AIProvider` interface and described that interface as three generic capabilities, text generation, structured extraction and vision extraction, in which callers pass a schema and receive a value.

Building the first real capability showed two problems with a generic interface. A method that accepts any instructions and any schema is an "ask the model anything" method, and every caller becomes a place where a prompt can be written and a guarantee forgotten. It also gives nothing to test against: a fake provider would have to interpret prompts.

ADR-004 and the architecture document also anticipated answering questions by letting the model call tools. A tool loop lets the model decide how many calls to make and in what order, which makes the path from a question to a database read harder to reason about.

## Decision

**The interface names tasks.** `AIProvider` has `interpretMessage` and `composeReply`. Each takes a typed request describing the task's inputs. Instructions and the output schema belong to the AI module, not to callers. A new capability, such as reading a receipt image, is a new method.

**Interpretation returns untrusted data.** `interpretMessage` returns `unknown`. The AI module validates it against the schema before anything else sees it.

**Requests cannot carry identity.** The request types contain text and names. They have no field for a household or a member identifier.

**Questions become one structured intent.** The model classifies a question into one of a fixed list of intents with parameters. The application runs the one finance engine method that intent maps to. There is no tool-calling loop.

**Replies are checked.** The model phrases a reply from facts the application supplies as finished strings. A reply containing a number that is not in those facts is discarded in favour of a deterministic rendering.

## Consequences

- There is exactly one place where each prompt is written and one place where each output is validated.
- A fake provider is a few lines, and tests can script malformed or hostile output directly.
- The set of things the model can cause is enumerable: one candidate transaction, or one of fourteen intents.
- A question that needs two calculations, such as comparing two members across two periods, cannot be answered in one turn. It needs a new intent.
- Adding a capability means changing the interface and every implementation of it. With one implementation this is cheap.
- The figure guard will occasionally replace a harmless reply, for example one that counts items. That is the accepted cost of never sending an unverified number.
- Tool calling remains available as a provider feature if a future capability needs it. It would be introduced behind a task-level method like any other.
