# ADR-033: Platform admins manage households without seeing inside them

- Status: Accepted
- Refines: [ADR-006](ADR-006-household-and-members.md), [ADR-022](ADR-022-dashboard-sessions.md)
- Date: 2026-10-07

## Context

The data model is already multi-tenant. The household is the tenant: every financial row carries `household_id`, composite keys keep references inside it, and the household comes only from the session or the WhatsApp identity (ADR-006, ADR-008, ADR-011).

What was missing was a way to run more than one household. Creating a household, adding a member, registering an email, issuing an invitation and registering a WhatsApp number were terminal scripts on the server, run by hand.

## Decision

**A platform admin is an ordinary member with one more row.** `platform_admins` lists the members who may manage households. An admin signs in like anyone else, keeps their own household, and sees their own finances in the dashboard as before. Nothing changes in sign-in, sessions or `RequestContext`.

**Admins manage tenants, not their contents.** The `platform` module offers `/platform/*` routes to:

- list households with their member and admin counts;
- create a household with its first member;
- change a household's name, time zone and language, but not its currency;
- add members, register a member's email, issue an invitation (the code is shown once) and revoke access;
- register and remove WhatsApp numbers;
- grant and revoke platform admin, never removing the last one.

The module imports no transaction, account, budget, goal, category or finance code, and its views carry no amounts. An architecture test enforces both.

**Access is decided in one place.** `PlatformAdminGuard` runs after `SessionGuard` and answers `403` to anyone not in `platform_admins`. It reads only the session's household and member.

**Every action is audited.** `platform_actions` records who acted, the action, and the household and member it touched. It stores identifiers only, never names, emails or phone numbers.

**The first admin comes from a command.** `platform/grant-platform-admin.ts` is idempotent. It finds the member by `EMAIL`, or by `HOUSEHOLD_NAME` and `MEMBER_NAME`, and grants admin. It registers the email when one is given, and prints an access code only when the member has neither a password nor a pending invitation. It creates a household and member only with `CREATE_IF_MISSING=true`.

## Consequences

- New households are created from the dashboard instead of the terminal, and every change has an author.
- The migration only adds two tables. No existing row changes.
- An admin can see the names, emails and WhatsApp numbers of every household's members, because managing access needs them. An admin cannot see any household's money.
- A household is never deleted from the dashboard. Removing one still needs a deliberate database operation and a backup.
