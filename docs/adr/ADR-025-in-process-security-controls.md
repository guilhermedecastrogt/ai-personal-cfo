# ADR-025: Security controls run inside the application, with in-memory rate limiting

- Status: Accepted
- Date: 2026-10-05

## Context

The application is about to be exposed to the internet. It needed rate limiting, consistent security headers, safe error responses and safe error logging, none of which existed as a deliberate layer.

The usual answers bring infrastructure: a shared store for rate limits, a gateway for headers, a logging pipeline for redaction. The project runs as one process beside one database and has ruled out Redis and similar services.

Two specifics shaped the decision. The browser never calls the API; the Next.js server does, so the API sees one client address for all dashboard visitors. And an unexpected database error carries its query parameters in its message, so logging errors in the default way can write amounts, merchants and token hashes to the log.

## Decision

A `security` module owns the cross-cutting controls, with every threshold in one policy object.

- **Rate limiting is in memory, per process, in fixed windows.** A guard applies a named limit to each public controller. Dashboard requests are counted per session token so that the shared web server address does not matter. Sign-in and webhook requests are counted per client address. Model usage is bounded separately, per member, after identity resolution.
- **Brute-force resistance does not rest on the limiter.** Access codes and session tokens are 256-bit random values, so the limiter bounds load and abuse, not guessing.
- **One exception filter handles every unexpected error.** It returns a fixed body and logs the error's class, its cause's class and stack frames, never its message.
- **Headers and body limits are set by one function at startup**, used by the entry point and by the tests.
- **The API authenticates only from a header and enables no CORS.** CSRF protection for the web application is Next.js's origin check on server actions together with a `SameSite` cookie, not a token.
- **Production configuration fails closed** on placeholder secrets.

## Alternatives considered

- **A database-backed rate limiter.** It would be shared across processes and survive restarts, but adds a write to every request, including the ones being rejected. Rejected while the application runs as a single process.
- **Rate limiting only at the reverse proxy.** Still recommended as an outer layer, but it cannot count per session token or per member, and the repository would have no limit of its own.
- **Forwarding the browser's address from the web server.** Rejected for now. The API would have to trust a header set by another component, which is a new way to get the limit wrong.
- **A CSRF token.** Rejected as redundant while the API ignores cookies and every state change is a server action.
- **A per-request nonce for the content security policy.** Deferred. It requires middleware on every page and was not needed to remove a concrete weakness, since the application renders no user-supplied markup.

## Consequences

- No new infrastructure, and the limits are covered by ordinary tests.
- Running more than one API process multiplies every limit. The first step to horizontal scaling is to move the limiter's state into PostgreSQL or the proxy.
- A restart forgets all counters.
- One visitor can use up the shared sign-in allowance for a minute.
- An unexpected error is harder to diagnose from the log alone, because its message is withheld. The request identifier and stack frames are what remain.
- The web application's policy still allows inline scripts.
