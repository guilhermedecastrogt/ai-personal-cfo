# ADR-002: TypeScript backend on NestJS

- Status: Accepted
- Date: 2026-10-05

## Context

The backend has to handle webhooks, call an AI provider, model a financial domain with strict invariants and serve a REST API to a TypeScript frontend. Much of its correctness depends on data crossing boundaries intact: model output into the domain, the domain into the database, the API into the dashboard.

## Decision

The backend is written in TypeScript on Node.js with:

- **NestJS** for module structure and dependency injection.
- **Drizzle ORM** for database access and migrations.
- **Zod** for runtime validation at every boundary where data enters from outside the type system.
- **Jest** for tests.

TypeScript runs in strict mode. The repository is an npm workspace containing the backend and the dashboard.

## Reasoning

**One language across the stack.** The dashboard is TypeScript regardless. Sharing a language lets API contracts be expressed once and removes a class of drift between backend responses and frontend expectations.

**NestJS.** Its module system maps directly onto the modular monolith in [ADR-001](ADR-001-modular-monolith.md), and constructor injection makes it straightforward to substitute a fake `AIProvider` or `WhatsAppProvider` in tests. The framework is confined to the edges. The finance engine and domain rules are plain classes and functions that do not import it.

**Drizzle.** Its schema is ordinary TypeScript, its queries stay close to SQL, and it generates plain SQL migrations that can be read and reviewed. It has no query engine binary, which avoids ARM64 packaging concerns. A heavier ORM would hide SQL that a financial system benefits from seeing.

**Zod.** Static types say nothing about what a model, a webhook or an HTTP client actually sends. A Zod schema gives a runtime check and a static type from one definition, and the same schema can be used to request structured output from the AI provider.

## Alternatives considered

**Python with FastAPI** has a strong AI ecosystem, but the AI surface here is a few HTTP calls behind one interface, and it would split the codebase across two languages.

**Go** would give a smaller footprint and simpler deployment, at the cost of more boilerplate for validation and no shared types with the dashboard.

**Express or Fastify without a framework** would mean less machinery, but the module and injection structure would have to be built and maintained by hand.

## Consequences

- JavaScript numbers are floating point. Money must never be held in a `number` that represents a fractional amount. Amounts are integers in minor units, parsed from decimal strings without passing through floating-point arithmetic.
- NestJS brings decorators and some ceremony. Keeping domain logic free of it limits how far that reaches.
- The Node.js process uses more memory than a compiled binary would. The target machine has ample headroom.
