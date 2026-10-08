# Contributing

Thanks for taking the time to look. This is a personal project built in the open, so the scope is deliberately narrow; open an issue before starting anything large.

## Before you start

- Read [docs/architecture.md](docs/architecture.md) and the [architecture decision records](docs/adr/README.md). A change that goes against an accepted decision needs a new ADR, not a workaround.
- Set up the project with the [development guide](docs/development.md).

## Rules the code follows

- The finance engine is deterministic. A language model never performs a financial calculation, and money is always integer minor units.
- Model output is untrusted input: it is parsed with Zod and validated against the domain before it can cause a write.
- The household comes only from the session or the WhatsApp identity, never from a request body.
- The dashboard renders figures the API computed; it does not calculate.
- No comments in source code; names, types and structure carry the meaning, and the reasoning lives in `docs/`.
- Exact dependency versions, ES modules, Conventional Commits.

Architecture tests in `apps/api/src/architecture.spec.ts` and `apps/web/src/architecture.spec.ts` enforce several of these.

## Pull requests

Every pull request must pass the same checks as CI:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration --workspace apps/api
npm run build
```

- Keep each pull request to one change, with tests that show it working.
- Update the relevant document in `docs/` when behaviour changes.
- Never commit secrets, `.env` files, real personal data or Terraform state. Test data is fictional.
