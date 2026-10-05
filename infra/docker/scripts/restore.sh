#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
export LOG_SCOPE=restore
require_env_file
configure_edge

MODE="${1:-}"
FILE="${2:-}"
[ "$MODE" = "verify" ] || [ "$MODE" = "replace" ] || fail "usage: restore.sh verify|replace <backup-file>"
[ -f "$FILE" ] || fail "backup file not found: $FILE"

export IMAGE_TAG="${IMAGE_TAG:-$(cat "$STACK_DIR/.deployed-tag" 2>/dev/null || echo unknown)}"
DATABASE="$(setting POSTGRES_DB)"
USER_NAME="$(setting POSTGRES_USER)"
SCRATCH="${DATABASE}_restore_check"

psql_in() {
  compose exec -T postgres psql --username "$USER_NAME" --dbname "$1" --quiet --tuples-only --no-align \
    --set ON_ERROR_STOP=1 --command "$2"
}

restore_into() {
  compose exec -T postgres pg_restore --username "$USER_NAME" --dbname "$1" \
    --no-owner --no-privileges --exit-on-error --single-transaction <"$FILE"
}

summarize() {
  log "database=$1 tables=$(psql_in "$1" "select count(*) from information_schema.tables where table_schema = 'public'") households=$(psql_in "$1" 'select count(*) from households') transactions=$(psql_in "$1" 'select count(*) from transactions')"
}

if [ "$MODE" = "verify" ]; then
  psql_in postgres "drop database if exists \"$SCRATCH\""
  psql_in postgres "create database \"$SCRATCH\""
  trap 'psql_in postgres "drop database if exists \"$SCRATCH\"" || true' EXIT
  restore_into "$SCRATCH"
  summarize "$SCRATCH"
  log "the backup restores cleanly; the live database was not touched"
  exit 0
fi

[ "${CONFIRM_RESTORE:-}" = "$DATABASE" ] ||
  fail "this replaces every row in '$DATABASE'. Re-run with CONFIRM_RESTORE=$DATABASE to proceed"

log "taking a safety backup of the current database first"
"$STACK_DIR/scripts/backup.sh"

log "stopping api and web"
compose stop api web

psql_in postgres "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$DATABASE' and pid <> pg_backend_pid()" >/dev/null
psql_in postgres "drop database \"$DATABASE\""
psql_in postgres "create database \"$DATABASE\""
restore_into "$DATABASE"
summarize "$DATABASE"

log "starting api and web"
compose up --detach --wait --wait-timeout "${DEPLOY_WAIT_TIMEOUT:-180}" api web
log "restore complete from file=$FILE"
