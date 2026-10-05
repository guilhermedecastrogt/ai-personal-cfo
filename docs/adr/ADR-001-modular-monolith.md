# ADR-001: Modular monolith

- Status: Accepted
- Date: 2026-10-05

## Context

The system serves one household. Its load is a handful of messages a day and occasional dashboard visits. It runs on a single free-tier ARM64 virtual machine, and it is built and operated by one person.

It nevertheless has several distinct areas of responsibility: messaging, AI extraction, the financial domain, calculation, insights and reporting. Those areas change for different reasons and should not bleed into each other.

## Decision

The backend is one NestJS application, deployed as one container, organised as modules with enforced boundaries.

- Each module owns its tables and exposes a service interface. Other modules use that interface and never query its tables directly.
- Dependencies point one way: entry points and orchestration depend on the domain, the domain depends on nothing above it, and the finance engine depends on nothing at all.
- Calls between modules are in-process function calls inside a single database transaction where atomicity is needed.
- Work that outlives a request, such as processing a message after acknowledging its webhook, runs in-process. No message broker is introduced.

The dashboard is a separate Next.js application because it has a different runtime and build, not because it is a separate service in the architectural sense. It contains no business logic.

## Alternatives considered

**Microservices.** They would add network boundaries, deployment coordination, distributed failure modes and several times the memory footprint, to solve scaling and team-autonomy problems this project does not have.

**An unstructured monolith.** It would be faster to start and would lose the property that matters most here: a finance engine that is provably isolated from AI and I/O.

**Serverless functions.** They fit the bursty load, but tie the project to a vendor, complicate local development and work against the goal of running everything on one machine.

## Consequences

- One process to run, observe, back up and deploy. Local development is one Compose file.
- Recording a transaction and its side effects can be atomic without distributed coordination.
- Boundaries are held by convention and by lint rules on imports, not by a network. They can erode if not maintained.
- A crash takes down everything at once. For a household tool this is acceptable.
- Work continuing after a webhook acknowledgement is lost if the process dies. The recorded webhook event makes such cases detectable and retryable, and a durable queue remains an option if this proves insufficient.
- If a module ever needs to be extracted, its service interface is the seam.
