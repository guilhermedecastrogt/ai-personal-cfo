#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
export LOG_SCOPE=deploy

[ $# -eq 1 ] || fail "usage: deploy.sh <image-tag>"
require_env_file

export IMAGE_TAG="$1"
STATE_FILE="$STACK_DIR/.deployed-tag"
PREVIOUS_FILE="$STACK_DIR/.previous-tag"
PREVIOUS_TAG="$(cat "$STATE_FILE" 2>/dev/null || true)"
WAIT_TIMEOUT="${DEPLOY_WAIT_TIMEOUT:-180}"
STAGE=starting

on_failure() {
  log "FAILED during stage=$STAGE tag=$IMAGE_TAG"
  compose ps --all || true
  for service in migrate api web caddy; do
    log "last log lines of $service"
    compose logs --no-color --tail 40 "$service" 2>/dev/null || true
  done
  if [ -n "$PREVIOUS_TAG" ]; then
    log "the previous release was tag=$PREVIOUS_TAG; run scripts/rollback.sh to return to it"
  fi
}
trap on_failure ERR

log "begin tag=$IMAGE_TAG previous=${PREVIOUS_TAG:-none}"

STAGE=configuration
compose config --quiet

if [ "${SKIP_PULL:-0}" != "1" ]; then
  STAGE=pull
  compose pull --quiet migrate api web caddy postgres
fi

STAGE=database
compose up --detach --wait --wait-timeout "$WAIT_TIMEOUT" postgres

if [ -n "$PREVIOUS_TAG" ] && [ "${SKIP_PRE_DEPLOY_BACKUP:-0}" != "1" ]; then
  STAGE=backup
  "$STACK_DIR/scripts/backup.sh"
fi

STAGE=migrations
compose run --rm --no-deps migrate

STAGE=services
compose up --detach --remove-orphans --wait --wait-timeout "$WAIT_TIMEOUT" api web caddy

STAGE=verification
"$STACK_DIR/scripts/verify.sh"

if [ -n "$PREVIOUS_TAG" ] && [ "$PREVIOUS_TAG" != "$IMAGE_TAG" ]; then
  printf '%s\n' "$PREVIOUS_TAG" >"$PREVIOUS_FILE"
fi
printf '%s\n' "$IMAGE_TAG" >"$STATE_FILE"

log "done tag=$IMAGE_TAG"
