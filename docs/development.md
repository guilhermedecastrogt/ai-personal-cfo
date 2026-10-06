# Development

## Prerequisites

- Node.js 22 or later. The repository has an `.nvmrc`.
- Docker, for the local PostgreSQL instance.

## Setup

```sh
npm install
docker compose -f docker-compose.dev.yml up -d --wait
cp apps/api/.env.example apps/api/.env
npm run db:migrate --workspace apps/api
npm run db:seed --workspace apps/api
npm run start:dev --workspace apps/api
```

The API starts on port 3000 and restarts when a source file changes.

`docker-compose.dev.yml` runs only PostgreSQL, bound to `127.0.0.1:5432`, with credentials that exist for local development and match `.env.example`. It is not the deployment configuration.

## Repository layout

The repository is an npm workspace.

```
apps/api          NestJS backend
apps/web          Next.js dashboard
infra/terraform   Infrastructure
docs              Documentation
```

Formatting and lint configuration live at the root and apply to every workspace. Each workspace owns its TypeScript and test configuration.

## Commands

Run from the repository root. Each delegates to every workspace that defines the script.

| Command                    | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `npm run format`           | Format every file with Prettier                       |
| `npm run format:check`     | Fail if any file is not formatted                     |
| `npm run lint`             | ESLint with type-aware rules                          |
| `npm run typecheck`        | TypeScript without emitting                           |
| `npm test`                 | Unit and HTTP-level tests. Needs no running services  |
| `npm run test:integration` | Tests against a real PostgreSQL. Needs `DATABASE_URL` |
| `npm run build`            | Compile every workspace                               |

`npm run proactive:evaluate -w apps/api` runs one proactive evaluation and exits, for use from an external scheduler. See [proactive-cfo.md](proactive-cfo.md).

The dashboard has its own environment file, `apps/web/.env.example`, with one variable: `API_URL`, the address of the API as seen from the web server.

Each integration test file creates its own database from the migrations and drops it afterwards, so the tests never touch development data. To run them against the local PostgreSQL:

```sh
DATABASE_URL=postgres://cfo:cfo@localhost:5432/cfo npm run test:integration
```

A change is ready to commit when formatting, lint, type checking, tests and the build all pass.

## Environment variables

The backend reads its configuration from the environment once, at startup, and validates it. If a variable is missing or invalid the process exits and names the offending variables without printing their values.

| Variable                       | Required | Default              | Purpose                                                                                          |
| ------------------------------ | -------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                 | Yes      |                      | PostgreSQL connection string, `postgres://` or `postgresql://`                                   |
| `PORT`                         | No       | `3000`               | Port the API listens on                                                                          |
| `NODE_ENV`                     | No       | `development`        | `development`, `test` or `production`                                                            |
| `LOG_LEVEL`                    | No       | `log`                | `error`, `warn`, `log` or `debug`                                                                |
| `OPENAI_API_KEY`               | Yes      |                      | Credential for the OpenAI API                                                                    |
| `OPENAI_MODEL`                 | Yes      |                      | Model used for interpretation and replies                                                        |
| `OPENAI_REASONING_EFFORT`      | No       | `low`                | `minimal`, `low`, `medium`, `high`, or `off` for a model that does not reason                    |
| `AI_CONFIDENCE_THRESHOLD`      | No       | `0.8`                | Below this, an extracted transaction is confirmed instead of recorded                            |
| `KAPSO_API_KEY`                | Yes      |                      | Kapso project API key                                                                            |
| `KAPSO_WEBHOOK_SECRET`         | Yes      |                      | Secret for verifying webhook signatures                                                          |
| `KAPSO_PHONE_NUMBER_ID`        | Yes      |                      | WhatsApp phone number identifier of the assistant                                                |
| `KAPSO_API_BASE_URL`           | No       | Kapso's WhatsApp API | Base URL of the provider API                                                                     |
| `PROACTIVE_EVALUATION_ENABLED` | No       | `false`              | Run the periodic proactive evaluation inside the API process                                     |
| `PROACTIVE_AI_MESSAGES`        | No       | `false`              | Let the model phrase proactive notifications, with a deterministic fallback                      |
| `TRUSTED_PROXY_HOPS`           | No       | `0`                  | Number of reverse proxies in front of the API, used to find the client address for rate limiting |

With `NODE_ENV=production` the process refuses to start on placeholder credentials, a short webhook secret or the development database credentials. See [security.md](security.md).

The example file has placeholder credentials. The application starts with them, and calls to the model and to WhatsApp fail gracefully until real ones are set. Database commands and tests need only `DATABASE_URL`.

Application code never reads `process.env`. It receives a typed configuration object by injection, which keeps configuration in one place and makes it replaceable in tests.

## Health endpoints

| Endpoint      | Meaning                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `GET /health` | The process is running. Does not touch the database.                        |
| `GET /ready`  | The process can serve requests. Returns 503 when PostgreSQL is unreachable. |

They are separate so that an orchestrator can restart a hung process without restarting a healthy one whose database is briefly away.

## Logging

Logs are written to standard output: human-readable in development, one JSON object per line when `NODE_ENV` is `production`.

Log statements describe what happened in the system. They must not contain message text, amounts, merchants, phone numbers, connection strings or error objects from the database driver, since those can carry any of the above.

## Tests

| Suffix                        | Kind                                                   | Runs with                        |
| ----------------------------- | ------------------------------------------------------ | -------------------------------- |
| `*.spec.ts` beside the source | Unit                                                   | `npm test`                       |
| `test/*.e2e-spec.ts`          | The HTTP surface with infrastructure replaced by stubs | `npm test`                       |
| `test/*.int-spec.ts`          | Code against real PostgreSQL                           | `npm run test:integration`       |
| `test/*.live-spec.ts`         | Calls to the real OpenAI API                           | `npm run test:live`, never in CI |

Tests use hand-written stubs passed through dependency injection. Test names state behaviour.

## Conventions

- **No comments in source code.** Names, types and structure carry the meaning. Explanations of why belong in `docs/` and in ADRs.
- **ES modules.** NestJS 12 is published as ES modules, so the backend is too. Relative imports are written with a `.js` extension, as Node.js requires.
- **TypeScript 6.** The lint and test toolchain does not yet support TypeScript 7.
- **Exact dependency versions.** Upgrades are deliberate changes with their own commit.
- **Validation at boundaries.** Anything entering from outside the type system, such as environment variables, request bodies, webhooks and model output, is parsed with a Zod schema before use.
- **Conventional Commits**, one meaningful step per commit.

Schema changes, migrations and seeding are described in [database.md](database.md).
