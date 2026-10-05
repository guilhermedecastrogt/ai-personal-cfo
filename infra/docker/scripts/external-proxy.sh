#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
export LOG_SCOPE=proxy
require_env_file

DOMAIN="$(setting CFO_DOMAIN)"
SITES_DIR="$(setting EDGE_PROXY_SITES_DIR)"
CONTAINER="$(setting EDGE_PROXY_CONTAINER)"
CONFIG="$(setting EDGE_PROXY_CONFIG /etc/caddy/Caddyfile)"
SITE_FILE="$SITES_DIR/cfo.caddy"
TEMPLATE="$STACK_DIR/external-proxy/cfo.caddy.template"

[ -n "$SITES_DIR" ] || fail "EDGE_PROXY_SITES_DIR is required when EDGE_PROXY=external"
[ -n "$CONTAINER" ] || fail "EDGE_PROXY_CONTAINER is required when EDGE_PROXY=external"
[ -d "$SITES_DIR" ] || fail "the sites directory $SITES_DIR does not exist; the external proxy must provide it"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || fail "CFO_DOMAIN is not a plain host name"
docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true ||
  fail "the external proxy container $CONTAINER is not running"

CANDIDATE="$(mktemp)"
BACKUP="$(mktemp)"
trap 'rm -f "$CANDIDATE" "$BACKUP"' EXIT
sed "s/__CFO_DOMAIN__/$DOMAIN/" "$TEMPLATE" >"$CANDIDATE"

if [ -f "$SITE_FILE" ] && cmp -s "$CANDIDATE" "$SITE_FILE"; then
  log "site definition unchanged file=$SITE_FILE"
  exit 0
fi

HAD_PREVIOUS=0
if [ -f "$SITE_FILE" ]; then
  cp "$SITE_FILE" "$BACKUP"
  HAD_PREVIOUS=1
fi

restore_previous() {
  if [ "$HAD_PREVIOUS" = "1" ]; then
    cp "$BACKUP" "$SITE_FILE"
  else
    rm -f "$SITE_FILE"
  fi
}

cp "$CANDIDATE" "$SITE_FILE"
chmod 644 "$SITE_FILE"

if ! docker exec "$CONTAINER" caddy validate --config "$CONFIG" >/dev/null 2>&1; then
  restore_previous
  fail "the external proxy rejected the configuration; the site file was put back and the proxy was not reloaded"
fi

if ! docker exec "$CONTAINER" caddy reload --config "$CONFIG" >/dev/null 2>&1; then
  restore_previous
  fail "the external proxy could not reload; the site file was put back"
fi

log "site definition installed file=$SITE_FILE container=$CONTAINER"
