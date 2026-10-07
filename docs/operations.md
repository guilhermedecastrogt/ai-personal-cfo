# Operations

How to see what the production system is doing and what to do when it is not doing it. All commands run on the VM, in the stack directory.

```sh
cd /opt/ai-personal-cfo
alias cfo='IMAGE_TAG=$(cat .deployed-tag) docker compose --env-file .env --file compose.yml'
```

The alias is used throughout this page. Compose needs the image tag to resolve the stack, and `.deployed-tag` holds the one that is running.

## Is it healthy?

```sh
cfo ps
```

Every long-running container should be `running` and `healthy`. `migrate` should be `exited (0)`.

| Check                      | Command                                                                               | Healthy answer         |
| -------------------------- | ------------------------------------------------------------------------------------- | ---------------------- |
| Everything at once         | `./scripts/verify.sh`                                                                 | Ends with `status=200` |
| API is alive               | `cfo exec api wget -qO- http://127.0.0.1:3000/health`                                 | `{"status":"ok"}`      |
| API can reach the database | `cfo exec api wget -qO- http://127.0.0.1:3000/ready`                                  | `{"status":"ready"}`   |
| Web application            | `cfo exec web wget -qO /dev/null http://127.0.0.1:3000/login && echo ok`              | `ok`                   |
| From outside               | `curl -sI https://<domain>/login`                                                     | `HTTP/2 200`           |
| Webhook route              | `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<domain>/webhooks/whatsapp` | `401`                  |

`/health` answers whenever the process is running and depends on nothing. `/ready` runs one trivial query and answers `503` when the database cannot be reached. Neither returns any detail. They are not reachable from the internet: Caddy does not route them.

A `401` from the webhook route is the healthy answer to an unsigned request. It shows that Caddy, the API and signature checking are all working.

### Container health checks

| Container  | Check                    | Interval |
| ---------- | ------------------------ | -------- |
| `postgres` | `pg_isready`             | 10 s     |
| `api`      | `GET /ready`             | 15 s     |
| `web`      | `GET /login`             | 15 s     |
| `caddy`    | Its local admin endpoint | 15 s     |

Docker restarts a container that exits. It does not restart one that is merely unhealthy: an unhealthy state is a signal to look, shown by `cfo ps`.

## Logs

```sh
cfo logs --tail 100 api
cfo logs --follow api web
cfo logs --since 30m caddy
cfo logs migrate
```

Each container keeps at most five files of 10 MB, so logs cannot fill the disk.

The API writes one JSON object per line in production.

| Line                                                                 | Meaning                                        |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| `event=started environment=production port=3000`                     | The process is listening                       |
| `event=stopping signal=SIGTERM`                                      | A shutdown was requested                       |
| `event=request request=<id> method=… route=… status=… duration_ms=…` | One request. Health checks are not logged      |
| `event=unhandled-error request=<id> … error=<class>`                 | An unexpected failure, answered with `500`     |
| `event=rate-limited surface=…`                                       | A limit was hit                                |
| `event=rejected reason=authentication provider=kapso`                | A webhook with a bad signature                 |
| `event=ignored reason=unknown-sender`                                | A message from a number that is not registered |
| `event=completed provider=kapso outcome=…`                           | A message was handled                          |
| `Database is not reachable`                                          | A readiness check failed                       |

The `route` in a request line is at most the first two fixed segments of the path, such as `/dashboard/notifications`. Query strings, identifiers and anything else in the path are not logged.

Every response carries an `X-Request-Id`. The same identifier is on the request line and, if the request failed unexpectedly, on the error line:

```sh
cfo logs api | grep <request id>
```

Logs never contain message text, amounts, merchants, phone numbers, access codes, tokens or keys ([security.md](security.md#logging-and-errors)). An unexpected error is logged as its class and stack frames, without its message.

Caddy logs its own lifecycle and certificate activity. It is not configured to write an access log.

## Diagnosing the database

| Symptom                        | Look at                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `/ready` answers `503`         | `cfo ps postgres`, then `cfo logs --tail 50 postgres`          |
| `postgres` is restarting       | Its logs. Out of memory shows as `exited (137)` in `cfo ps -a` |
| `migrate` exited with an error | `cfo logs migrate`: `event=migrations-failed error=… code=…`   |
| The API starts and then exits  | `cfo logs api`: a configuration error names the variable       |
| Disk is full                   | `df -h`, `docker system df`                                    |

```sh
cfo exec postgres pg_isready
cfo exec postgres psql -U "$(grep ^POSTGRES_USER= .env | cut -d= -f2)" -d "$(grep ^POSTGRES_DB= .env | cut -d= -f2)" -c 'select count(*) from transactions'
```

The `code` in a failed migration is the PostgreSQL or network error code: `ECONNREFUSED` means the database was not reachable, `28P01` means the password was refused, and a code starting with `42` is an error in the migration itself.

If the password is refused after changing `POSTGRES_PASSWORD` in `.env`, remember that the database keeps the password it was created with.

## A failed deployment

The workflow run in GitHub shows the same output as the VM. Find the line `deploy FAILED during stage=…`.

| Stage           | Usual cause                                                 | State of the system           |
| --------------- | ----------------------------------------------------------- | ----------------------------- |
| `configuration` | A variable is missing from `.env`                           | Unchanged                     |
| `pull`          | The VM cannot read the registry, or the tag does not exist  | Unchanged                     |
| `database`      | PostgreSQL did not become healthy                           | Unchanged                     |
| `backup`        | The backup directory is missing or full                     | Unchanged                     |
| `migrations`    | A migration failed                                          | Old release still serving     |
| `services`      | A new container did not become healthy, often configuration | New release partly up         |
| `verification`  | Caddy cannot serve the domain: DNS, firewall or certificate | New release up, not reachable |

For the last two, read the logs the script printed, then either fix the cause and deploy again, or run `./scripts/rollback.sh`.

## Resource use

```sh
docker stats --no-stream
free -h
```

`docker stats` shows each container against its limit. A container at its memory limit is killed and restarted by Docker. If that happens to the CFO, raise that limit only if the machine has room after Minecraft: see [infrastructure.md](infrastructure.md#resource-budget).

## One-off commands

These run inside the API container, which has the compiled scripts but not `npm`.

```sh
cfo exec -e HOUSEHOLD_NAME="…" -e MEMBER_NAME="…" -e EMAIL="…" api node dist/auth/register-email.js
cfo exec -e HOUSEHOLD_NAME="…" -e MEMBER_NAME="…" api node dist/auth/issue-access-code.js
cfo exec -e HOUSEHOLD_NAME="…" -e MEMBER_NAME="…" api node dist/auth/revoke-access.js
cfo exec api node dist/proactive/run-proactive-evaluation.js
```

An access code is printed once. It appears in your terminal, not in the logs.

Seeding is never automatic. To create the first household, copy a seed file to the VM and run the seed script deliberately:

```sh
cfo run --rm --no-deps -v /path/to/household.local.json:/seed.json:ro -e SEED_DEFINITION_FILE=/seed.json migrate node dist/database/seed/run-seed.js
```

Always pass `SEED_DEFINITION_FILE`. Without it the script loads the demo household, which does not belong in production. The format of the file is described in [database.md](database.md#seed-data).

## Platform admins

A platform admin manages households from the dashboard's administration area ([ADR-033](adr/ADR-033-platform-administration.md)). Grant the first one with a command; later ones can be granted from the dashboard.

```sh
cfo exec -e EMAIL="…" api node dist/platform/grant-platform-admin.js
cfo exec -e HOUSEHOLD_NAME="…" -e MEMBER_NAME="…" -e EMAIL="…" api node dist/platform/grant-platform-admin.js
```

The command is idempotent and changes nothing when it finds no member. With `EMAIL`, it registers the email if the member has none. It prints an access code only when the member has neither a password nor a pending invitation. With `CREATE_IF_MISSING=true` it creates the household and member first, taking `CURRENCY`, `TIMEZONE` and `LOCALE` (defaults `BRL`, `America/Sao_Paulo`, `pt-BR`).

## Household language

A household's dashboard, alerts and fixed replies follow its language, English by default. To switch one to Brazilian Portuguese:

```sh
cfo exec -e HOUSEHOLD_NAME="…" -e LOCALE=pt-BR api node dist/households/set-household-locale.js
```

It takes effect on the next request. Notifications already raised keep their original wording.

## Routine maintenance

| Task                          | How                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Remove old images             | `docker image prune --all --filter until=720h`. Keeps the last month            |
| Check backups                 | `ls -lh /var/backups/ai-personal-cfo`, `systemctl list-timers cfo-backup.timer` |
| Test a restore                | `./scripts/restore.sh verify <file>`, monthly                                   |
| Restart one service           | `cfo restart api`                                                               |
| Stop the CFO, leave Minecraft | `cfo stop`. Start again with `cfo start`                                        |

Never run `docker system prune --volumes` or `cfo down --volumes` on the VM: both delete the database volume. `docker system prune` without care can also remove images and volumes that belong to other things on the machine.
