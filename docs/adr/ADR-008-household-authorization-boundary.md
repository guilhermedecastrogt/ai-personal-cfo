# ADR-008: Household as the authorization boundary

- Status: Accepted
- Date: 2026-10-05

## Context

[ADR-006](ADR-006-household-and-members.md) makes all financial data shared within a household. Authorization therefore has one question to answer: does this request belong to the household whose data it touches? There is nothing to protect between members of the same household.

The first deployment holds a single household. Skipping scoping on that basis would leave the most important security property of a future multi-household system to be retrofitted across every query.

## Decision

The security boundary is drawn between households and nowhere else.

- Every entry point resolves a request context containing `householdId` and `memberId` before any application service runs. For WhatsApp the context comes from identity resolution ([ADR-007](ADR-007-whatsapp-identity-resolution.md)). For the dashboard it comes from the authenticated session, where a member signs in and the session carries their household.
- `householdId` is always taken from the request context. It is never read from a request body, a query string, a path parameter or model output.
- Repository methods require a `householdId` argument and include it in every query. There is no repository method that reads or writes financial data without one.
- Tools exposed to the AI for answering questions are bound to the request context by the application. The model chooses which tool to call and with which filters, such as a category or a member. It cannot supply or change the household.
- `memberId` is used for attribution and for personalising responses. It is never an input to an access decision.
- The dashboard is one shared view. Any member can see and ask about any other member's figures.

## Consequences

- A whole class of defects, reading another household's data through a forged identifier, is excluded by construction rather than by review.
- There are no roles, no permissions and no per-record visibility to build, test or explain.
- Any member can edit or delete any household record. An audit trail of who changed what is not part of the first version.
- Query-level scoping depends on discipline in the repository layer. Database row-level security would add a second line of defence and is a reasonable step if the system ever hosts more than one household.
