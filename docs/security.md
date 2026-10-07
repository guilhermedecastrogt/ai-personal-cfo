# Security

This document describes the security controls that exist in the code, what each one protects against, and what is not covered. It is a description of the current state, not a claim that the system is secure. Nothing here has been reviewed by a third party, and nothing has been exercised against the live OpenAI or Kapso services.

## Threat model

The application is assumed to face the public internet. Any HTTP client may be hostile. Webhook payloads, message text, image captions, image bytes and model output are all treated as untrusted. A registered member is trusted to see their own household's data and nothing else.

Out of scope: a compromised host, a compromised database, a malicious operator, and a compromised OpenAI or Kapso account.

## Exposed surface

| Surface                                | Who calls it   | Authentication                    | Rate limit      |
| -------------------------------------- | -------------- | --------------------------------- | --------------- |
| `POST /auth/sessions`                  | The web server | Access code in the body           | 10 per minute   |
| `DELETE /auth/sessions/current`        | The web server | Session token                     | 240 per minute  |
| `GET /dashboard/*`                     | The web server | Session token                     | 240 per minute  |
| `POST`, `PATCH`, `DELETE /dashboard/*` | The web server | Session token                     | 30 per minute   |
| `GET /platform/*`                      | The web server | Session token of a platform admin | 240 per minute  |
| `POST`, `PATCH`, `DELETE /platform/*`  | The web server | Session token of a platform admin | 30 per minute   |
| `POST /webhooks/whatsapp`              | Kapso          | HMAC signature                    | 600 per minute  |
| `GET /health`, `GET /ready`            | The platform   | None                              | None            |
| The Next.js application                | Browsers       | Session cookie                    | Through the API |

There are no other routes. Migrations, seeding and proactive evaluation are commands, not endpoints. Access codes are issued by a command or by a platform admin.

### Platform admins

A member listed in `platform_admins` may manage every household: create one, add members, register emails, issue invitations, revoke access, register WhatsApp numbers and grant admin to others ([ADR-033](adr/ADR-033-platform-administration.md)). `PlatformAdminGuard` answers `403` to everyone else.

- The platform routes return no amounts, and the platform module imports no financial code. An architecture test enforces both.
- Each action is recorded in `platform_actions` with the actor, the action and the identifiers it touched, without names, emails or phone numbers.
- The last admin cannot be revoked.
- The first admin is granted with `platform/grant-platform-admin.ts` ([operations.md](operations.md#platform-admins)).

## Authentication

A member signs in with an access code issued by an operator and receives a session ([ADR-022](adr/ADR-022-dashboard-sessions.md)).

### Email and password

Members sign in with an email and a password ([ADR-028](adr/ADR-028-email-and-password-sign-in.md)).

- Passwords are stored only as scrypt hashes with a per-password salt, and must have at least 10 characters.
- An email belongs to one member at most, compared without case.
- A wrong password, an unknown email and a malformed request all get the same `401`. An unknown email still spends the time of a password check.
- The sign-in and first-access forms use `username`, `current-password` and `new-password`, so phones save and fill the credentials.

### Access codes

An access code is now a one-time invitation: the member uses it on the first access page to set their password, and it is deleted when used. A new code resets a forgotten password and ends the member's sessions.

- 32 random bytes from the operating system, encoded as 43 URL-safe characters. Guessing one is not feasible, so brute-force resistance does not depend on rate limiting.
- Only the SHA-256 hash is stored. The code is printed once when issued and cannot be recovered.
- Sign-in looks the hash up by equality. The code itself is never compared, so there is no timing difference to measure.
- Every refused sign-in gets the same `401` response: wrong code, empty code, malformed body.
- A code is valid until it is rotated or revoked. It has no expiry.

| Command                                      | Effect                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run auth:issue-access-code -w apps/api` | Issues a new code, replaces the old one and ends every session of the member |
| `npm run auth:revoke-access -w apps/api`     | Removes the code, the email and password, and every session of the member    |
| `npm run auth:register-email -w apps/api`    | Registers the email the member must use on first access. Also takes `EMAIL`  |

Both take `HOUSEHOLD_NAME` and `MEMBER_NAME` from the environment.

### Sessions

- The token is 32 random bytes, generated by the server on each sign-in. A token proposed by the client is never adopted, so a session cannot be fixed in advance.
- Only the SHA-256 hash of the token is stored.
- A session lasts 7 days from sign-in and is not extended by use. Expired sessions are refused and removed at the next sign-in.
- A member has at most 10 sessions. The oldest is dropped when an eleventh is created.
- Sign-out deletes the session on the server. Signing in again from a browser that already has a session ends the previous one.

### The browser

- The token is held in a cookie that is `HttpOnly`, `SameSite=Lax`, `Path=/`, expires with the session, and is `Secure` in production. In production the cookie is named `__Host-cfo_session`, which browsers only accept over HTTPS, without a `Domain`, and for the whole host.
- Browser scripts cannot read the token. Client components never receive it.
- The browser talks only to the Next.js server. That server calls the API with the token as a bearer header. The access code travels in a request body, never in a URL.

## Authorization and household isolation

The household is the only authorization boundary ([ADR-008](adr/ADR-008-household-authorization-boundary.md)).

- The household and member come from the session, or from the WhatsApp identity of the sender. Nothing else is consulted.
- No route accepts a household or member. A `householdId` in a query string, a header or a webhook payload is ignored.
- Every repository method that returns household data takes the household as its first argument.
- Identifiers that a client may send, such as a transaction filter or a notification key, are looked up inside the session's household. One that belongs to another household matches nothing.
- A notification of another household and one that does not exist produce the same `404`.
- Composite foreign keys on `(household_id, member_id)` stop a row in one household from referencing a member of another.

The security suite requests every dashboard route as one household and checks that nothing of another appears, including under concurrent requests.

## Rate limiting

Limits are counted in memory, in fixed windows, by `security/rate-limiter.ts`. All values are in `security/security-policy.ts`.

| What                       | Counted per                           | Limit          | When exceeded                          |
| -------------------------- | ------------------------------------- | -------------- | -------------------------------------- |
| Sign-in attempts           | Client address                        | 10 per minute  | `429` with `Retry-After`               |
| Dashboard requests         | Session token, or address without one | 240 per minute | `429` with `Retry-After`               |
| Dashboard changes          | Session token, or address without one | 30 per minute  | `429` with `Retry-After`               |
| Webhook deliveries         | Client address                        | 600 per minute | `429` with `Retry-After`               |
| Text messages to the model | Member                                | 30 per minute  | Ignored, with one reply asking to wait |
| Images to the model        | Member                                | 6 per minute   | Ignored, with one reply asking to wait |

The dashboard limit runs before the session lookup, so a flood of invalid tokens does not reach the database. The per-member limits run after identity resolution, so they bound model usage by a registered sender. Unknown senders never reach the model at all.

A redelivered webhook counts against the limit but is otherwise accepted and ignored as a duplicate, so provider retries are not rejected at normal volumes.

Limitations:

- Counters live in one process. With several API processes each has its own, so the effective limit is multiplied. A restart resets them.
- The sign-in limit is per client address as the API sees it. The web server makes these calls, so in the standard deployment the limit applies to all visitors together. This bounds abuse but lets one visitor exhaust the allowance for a minute.
- The client address is only meaningful when `TRUSTED_PROXY_HOPS` matches the number of reverse proxies in front of the API.
- The number of tracked keys is capped at 50 000. Beyond that the oldest are forgotten.

A reverse proxy or the hosting provider should apply its own limits in front of these.

## Webhook

- The signature is an HMAC-SHA256 of the raw request body with the webhook secret, compared in constant time. A missing, malformed or wrong signature is refused with `401` before anything is parsed.
- Bodies over 256 KB are refused with `413` before the handler runs.
- A signed body that is not valid JSON or does not match the expected shape is refused with `400`.
- The event identifier is taken from the message identifier inside the signed body. The delivery header is not signed and is not used for deduplication.
- An event is claimed by a unique key before it is processed. A replay of a captured, correctly signed request is acknowledged and ignored, however long afterwards.
- The sender is resolved to a member by lookup. An unknown sender is acknowledged and nothing else happens: no model call, no reply, no stored message.
- Fields in the payload that name a household or member are not read.

Replay protection is the deduplication above. Kapso's signature does not cover a timestamp, so a request cannot be rejected for being old. Processed event identifiers are kept indefinitely.

## Media

Images arrive as a provider reference, never as a URL chosen by the sender ([ADR-018](adr/ADR-018-temporary-media.md)).

| Check                       | Where                                                           |
| --------------------------- | --------------------------------------------------------------- |
| Declared size over 10 MB    | Refused before download                                         |
| Actual size over 10 MB      | The download stream is cut off at the limit                     |
| File type                   | Read from the bytes. Only JPEG, PNG and WebP are accepted       |
| Dimensions                  | Between 32 and 10 000 pixels a side, read from the image header |
| Anything that fails a check | Never sent to the model                                         |

Files are written under a directory in the system temporary location with a random name generated by the application. No name from the sender or the provider is used in a path. The directory is created with owner-only permissions, and the application refuses to use it if it is a symbolic link or belongs to another user. Each image is deleted as soon as it has been processed, whether or not processing succeeded. At startup, entries older than 30 minutes are removed; newer ones are left in case another process is using them.

Nothing serves files from that directory, and no table has a column that could hold image bytes.

## Outbound requests

The application makes outbound requests to two places.

| Destination | Address comes from               | Timeout | Redirects   | Response size                |
| ----------- | -------------------------------- | ------- | ----------- | ---------------------------- |
| OpenAI      | The SDK's fixed endpoint         | Yes     | SDK default | Bounded by the output schema |
| Kapso API   | `KAPSO_API_BASE_URL`, HTTPS only | 15 s    | Refused     | Media capped at 10 MB        |

The media download address is returned by Kapso. It is used only if its origin equals the origin of `KAPSO_API_BASE_URL`. Any other host, including a private address, `localhost` or a non-HTTP scheme, is refused without a request being made. Redirects are treated as errors, so an allowed address cannot forward to another host. The provider API key is not sent with the download.

A media identifier is URL-encoded into a single path segment, so it cannot change the path of the lookup.

There is no function that fetches an arbitrary URL.

## Model boundaries

The model is treated as an untrusted component that produces text.

- It receives names and formatted amounts, never database identifiers, phone numbers or credentials.
- It receives only the household of the resolved sender. The sender's name and the member list are supplied by the application and cannot be changed by the message.
- Its structured output is validated against a schema. Fields outside the schema, such as a household, are discarded.
- A member, account or category it names is matched against the sender's household by the application. A name from another household matches nothing and leads to a clarifying question.
- It has no tools. It cannot query, write, send a message or choose a recipient.
- Every figure in a reply must appear in the facts the application supplied. A reply that fails this check is replaced by a deterministic one.
- It never sees its own earlier replies ([ADR-021](adr/ADR-021-structured-conversation-state.md)).

Prompt injection is not prevented and cannot be. A message or a receipt can make the model produce a wrong interpretation. The controls above limit what a wrong interpretation can do: at worst, a transaction with wrong details is recorded for the sender in the sender's own household, or an answer is refused.

Message text, captions and image bytes of registered members are sent to OpenAI. Requests set `store: false`.

## Logging and errors

- Log lines carry an event name and fixed categories. They do not carry message text, amounts, merchants, phone numbers, media identifiers, tokens, access codes or payloads.
- An unexpected error is logged by `SafeExceptionFilter` as its class name, the class name of its cause, and stack frames. Its message is never logged, because a database error message can contain query parameters.
- Every response has an `X-Request-Id`, and the same identifier is on the log line of an unexpected error.
- Clients receive a fixed message for `400`, `413`, `415` and `500`. Parser messages that echo part of the request are replaced.
- Configuration errors name the variables at fault and never their values.

The security suite runs the whole flow with a capturing logger and asserts that none of the secrets, messages, amounts, merchants or phone numbers it used appear.

## Browser protections

### Headers

| Header                         | API                                          | Web application                  |
| ------------------------------ | -------------------------------------------- | -------------------------------- |
| `Content-Security-Policy`      | `default-src 'none'; frame-ancestors 'none'` | Self only, see below             |
| `X-Content-Type-Options`       | `nosniff`                                    | `nosniff`                        |
| `X-Frame-Options`              | `DENY`                                       | `DENY`                           |
| `Referrer-Policy`              | `no-referrer`                                | `no-referrer`                    |
| `Permissions-Policy`           | Camera, microphone, geolocation, payment off | The same, plus topics            |
| `Strict-Transport-Security`    | One year, production only                    | One year, production only        |
| `Cache-Control`                | `no-store`                                   | Set by Next.js for dynamic pages |
| `Cross-Origin-Resource-Policy` | `same-origin`                                |                                  |
| `Cross-Origin-Opener-Policy`   |                                              | `same-origin`                    |
| `X-Powered-By`                 | Removed                                      | Removed                          |

The web application's policy allows scripts, styles, images, fonts and connections from its own origin only, forbids objects and framing, and restricts form targets and the base URI to itself. It includes `'unsafe-inline'` for scripts and styles, because Next.js emits inline scripts for hydration and the application does not yet generate a nonce per request. This weakens the policy against injected inline script. The application renders no user-supplied HTML, and React escapes all text.

HSTS is sent only in production, on the assumption that production is served over HTTPS.

### CORS

The API does not enable CORS and sends no `Access-Control-Allow-*` header to any origin. Browsers do not need to reach the API: the web server does.

### CSRF

- The API authenticates only from the `Authorization` header. It ignores cookies, so a cross-site request that carries a cookie is not authenticated.
- The web application's state-changing operations, sign-in, sign-out, marking a notification as read and the edits of [ADR-029](adr/ADR-029-dashboard-writes.md), are Next.js server actions. They accept only `POST`, and Next.js rejects an action whose `Origin` does not match the host.
- The session cookie is `SameSite=Lax`, so it is not sent on cross-site `POST` requests.
- Pages reached by `GET` only read.

No separate CSRF token is used. This relies on the three properties above continuing to hold, in particular that no state change is ever added behind a `GET`.

## Database

- The connection string comes only from `DATABASE_URL`.
- All queries go through Drizzle with bound parameters. No SQL is assembled from request input. Filters and sort orders are validated against fixed sets before use.
- Security-sensitive multi-step writes run in a transaction: rotating or revoking an access code together with ending sessions.
- Idempotency for webhooks and notifications rests on unique constraints, not on application checks.
- The development compose file binds PostgreSQL to `127.0.0.1`.

Not implemented: separate database roles. The application currently uses one role for migrations and for serving. For production, run migrations with an owner role and the application with a role that has only `SELECT`, `INSERT`, `UPDATE` and `DELETE` on the tables. Row-level security is not used; isolation is enforced in the application and by composite keys.

## Configuration

Configuration is read once at startup and validated. A missing or invalid variable stops the process.

With `NODE_ENV=production` the process also refuses to start when:

- `OPENAI_API_KEY`, `KAPSO_API_KEY` or `KAPSO_WEBHOOK_SECRET` is a placeholder from the example file or a similar stand-in,
- `KAPSO_WEBHOOK_SECRET` is shorter than 16 characters,
- `KAPSO_PHONE_NUMBER_ID` is all zeros,
- `DATABASE_URL` uses the development credentials.

| Variable             | Default | Purpose                                                               |
| -------------------- | ------- | --------------------------------------------------------------------- |
| `TRUSTED_PROXY_HOPS` | `0`     | Number of reverse proxies in front of the API, for the client address |

There is no session secret to configure. Tokens are random values looked up by hash, not signed values.

The web application reads two variables, `API_URL` and `NODE_ENV`. Neither is a secret, and nothing is exposed to the browser through `NEXT_PUBLIC_` variables.

## Secrets

- `.env` files are ignored by Git. The example files contain placeholders only.
- The repository and its history were searched for key patterns and private keys. None were found.
- Test fixtures use values that are obviously not real.
- Seed configuration with real names or numbers lives in `*.local.json`, which is ignored.

## Dependencies

`npm audit` reports 4 moderate advisories, all the same issue in the copy of `esbuild` bundled with `drizzle-kit`. It affects a development server that this project does not run, and `drizzle-kit` is a development dependency that is not part of the running application. The fix offered is a breaking downgrade of `drizzle-kit`, so it was not applied. There are no high or critical advisories.

## Runtime

The production stack is described in [infrastructure.md](infrastructure.md). The parts that matter for security:

- The API and web containers run as a non-root user with a read-only filesystem, all Linux capabilities dropped and `no-new-privileges`. Their only writable paths are in-memory temporary directories.
- Caddy keeps one capability, binding low ports.
- Every container has a memory and CPU limit.
- PostgreSQL is on an internal Docker network and publishes no port.
- Caddy is the only container with published ports. It routes one path to the API, the webhook. The API's health, sign-in and dashboard routes are not reachable from the internet.
- Secrets are in one file on the VM, mode `600`, and are passed as environment variables. None is built into an image or held by GitHub.
- `TRUSTED_PROXY_HOPS` is `1` in the stack, matching Caddy.
- There is one API container, so the in-memory rate limits are not multiplied.

PostgreSQL's own container runs with the image's defaults, and the deploy user's membership of the `docker` group is equivalent to root on the host.

## Known limitations

- Rate limits are per process and reset on restart.
- The sign-in limit is shared by all visitors behind the web server.
- Access codes do not expire.
- The web content security policy allows inline scripts.
- There is no audit log of sign-ins or of who viewed what.
- There is one database role, with no row-level security.
- Webhook replay protection depends on keeping every processed event identifier.
- Members of a household see all of that household's data. There is no per-member privacy.
- Prompt injection can cause a wrong transaction in the sender's own household.
- Message content and images are sent to OpenAI.
- Data is not encrypted by the application at rest. That is left to the database and the disk.
- Traffic between the containers is not encrypted. It stays on Docker's private networks on one host.
- No penetration test, fuzzing or third-party review has been done.
