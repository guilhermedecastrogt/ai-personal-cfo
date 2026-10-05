# ADR-028: Members sign in with email and password, and access codes become one-time invitations

- Status: Accepted
- Refines: [ADR-022](ADR-022-dashboard-sessions.md)
- Date: 2026-10-05

## Context

[ADR-022](ADR-022-dashboard-sessions.md) gave each member an access code: 43 random characters, entered on the sign-in page. It is strong, but nobody can remember or type it, and password managers do not treat it as a credential. On a phone, a member had to find the code and paste it every time a session expired.

Phones save and fill an email and password pair without effort, and suggest a strong password when an account is created. The project still has no sign-up, no email delivery and no account management, and an operator still decides who belongs to a household.

## Decision

**A member signs in with an email and a password.**

- Passwords are stored as scrypt hashes with a random salt per password (N = 32 768, r = 8, p = 1), in a `member_credentials` table keyed by member.
- An email belongs to at most one member, compared without case.

**The access code becomes a one-time invitation.**

- On the first access page, a member enters the code, their email and a new password.
- Doing so sets the password, deletes the code and ends the member's other sessions.
- Issuing a new code is how a forgotten password is reset.
- The operator can register a member's email in advance; the invitation is then accepted only with that email.

**The forms use the attributes password managers understand**: `username` on the email field, `current-password` on sign-in and `new-password` on first access.

**Every refusal looks the same.**

- A wrong password, an unknown email and an email without a password all get the same `401`.
- An unknown email still spends the time of a password check.
- An invitation refused for a wrong code, a different email or an email in use by someone else gets one `401`.
- A password that is too short gets `422`, because that reveals nothing.

Sessions, cookies, rate limits and the household boundary are unchanged ([ADR-025](ADR-025-in-process-security-controls.md)). Sign-in with the code alone still works until the code is used, so nothing breaks for a member who has not set a password yet.

## Consequences

- Members choose their own passwords, so their strength is only bounded below by the ten-character minimum. The rate limit on sign-in and first access is what stands against guessing.
- There is no self-service reset: a member who forgets the password asks for a new code.
- There is no second factor.
- Revoking access now also removes the member's email and password.
- An email address is personal data. It is stored only in the database and never in the repository or logs.
