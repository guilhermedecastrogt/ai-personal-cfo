# ADR-020: The monthly review is deterministic, and the model's narrative is checked against it

- Status: Accepted
- Date: 2026-10-05

## Context

The finance engine produces accurate figures. A household wants more than figures: what they mean, what changed, what to do. Language models are good at that last step and unreliable with numbers. Asked to review a month, a model will readily compute a difference, estimate a percentage, or suggest a target, and present each as fact.

ADR-004 and ADR-016 established that a model never produces a figure, and that replies are checked for numbers the application did not supply. The review is a larger output than a one-line reply, with more room for an invented number, and a richer input than a single result.

## Decision

**The review exists without the model.** A pure function builds a monthly review from a snapshot of finance engine results. The review includes coded findings, which are the system's own judgement of what is a strength and what is a concern. It is complete, correct and presentable before any model is called.

**The model receives a prepared context.** The review is converted to names and formatted text. It contains no identifier and no raw amount, so there is nothing for the model to convert or look up.

**The model returns a structured narrative.** Summary, strengths, concerns, recommendations and priorities, as text.

**The narrative is validated as a whole.** Its structure, its size, and every number in it are checked. A number that is not in the context, or in the member's message, fails the check.

**A failed narrative is replaced, not repaired.** The deterministic narrative, built from the same findings with fixed templates, is used. The request is not retried.

**New thresholds join the existing policy.** The review adds savings-rate levels and list sizes to `FinancePolicy`.

## Alternatives considered

**Letting the model decide what is a concern** from the raw results would make the review's substance depend on the model, differ between runs, and be untestable. Coded findings can be tested one by one.

**Regenerating on failure** would often succeed on a second attempt. It doubles cost and latency in the failure case, and a model that invented a figure once is being asked the same question again. A correct, plainer narrative now is better than a possibly better one later.

**Removing the offending sentence** keeps most of the model's work. It can also leave a narrative that no longer makes sense, and a sentence boundary is not a trust boundary.

**Allowing small integers** to pass the figure check would stop narratives that count items from being rejected. It would also let "save €5 more each week" through.

**A tool-calling advisor** that queries the engine as it reasons is more flexible. It makes the set of data read per request unpredictable, and it is the kind of autonomy this project has chosen not to give a model.

## Consequences

- A household always receives a review whose figures are the engine's, whether or not a model is available.
- Every finding and threshold is covered by ordinary unit tests.
- The model cannot introduce a number. It can still misplace one.
- Some acceptable narratives are discarded. The cost is a plainer review in English.
- The model's judgement about emphasis is used, and its judgement about facts is not.
- Supporting another analysis, such as a yearly review, means another pure builder and another context, with the same explainer.
