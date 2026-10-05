#!/usr/bin/env bash

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$STACK_DIR/.env}"

log() {
  printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${LOG_SCOPE:-stack}" "$*"
}

fail() {
  log "error: $*" >&2
  exit 1
}

require_env_file() {
  [ -f "$ENV_FILE" ] || fail "missing $ENV_FILE (copy .env.example and fill it in)"
}

EDGE_PROXY="${EDGE_PROXY:-}"

configure_edge() {
  EDGE_PROXY="${EDGE_PROXY:-$(setting EDGE_PROXY bundled)}"
  case "$EDGE_PROXY" in
    bundled)
      export PROXY_SERVICE=caddy
      ;;
    external)
      export PROXY_SERVICE=
      export EDGE_NETWORK_NAME="${EDGE_NETWORK_NAME:-$(setting EDGE_NETWORK_NAME edge)}"
      export EDGE_NETWORK_EXTERNAL=true
      ;;
    *)
      fail "EDGE_PROXY must be 'bundled' or 'external'"
      ;;
  esac
}

compose() {
  docker compose --env-file "$ENV_FILE" --file "$STACK_DIR/compose.yml" "$@"
}

setting() {
  local value
  value="$(grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-)"
  printf '%s' "${value:-${2:-}}"
}
