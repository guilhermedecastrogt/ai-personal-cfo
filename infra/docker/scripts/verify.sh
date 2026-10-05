#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
export LOG_SCOPE=verify
require_env_file
configure_edge

export IMAGE_TAG="${IMAGE_TAG:-$(cat "$STACK_DIR/.deployed-tag" 2>/dev/null || echo unknown)}"
DOMAIN="$(setting CFO_DOMAIN)"
HTTPS_PORT="$(setting HTTPS_PORT 443)"
ATTEMPTS="${VERIFY_ATTEMPTS:-20}"

check_inside() {
  compose exec -T "$1" wget --quiet --tries=1 --output-document=/dev/null "$2"
}

check_inside api http://127.0.0.1:3000/health || fail "api liveness check failed"
check_inside api http://127.0.0.1:3000/ready || fail "api readiness check failed (database unreachable?)"
check_inside web http://127.0.0.1:3000/login || fail "web check failed"
log "containers answer: api live, api ready, web"

for attempt in $(seq 1 "$ATTEMPTS"); do
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 \
    --resolve "$DOMAIN:$HTTPS_PORT:127.0.0.1" "https://$DOMAIN:$HTTPS_PORT/login" \
    ${VERIFY_INSECURE:+--insecure} || true)"
  if [ "$status" = "200" ]; then
    log "https answer: $DOMAIN/login status=200"
    exit 0
  fi
  log "waiting for https attempt=$attempt status=${status:-none}"
  sleep 3
done

fail "https check through Caddy did not succeed for $DOMAIN"
