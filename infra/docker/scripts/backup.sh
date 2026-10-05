#!/usr/bin/env bash
set -euo pipefail
umask 077

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
export LOG_SCOPE=backup
require_env_file
configure_edge

export IMAGE_TAG="${IMAGE_TAG:-$(cat "$STACK_DIR/.deployed-tag" 2>/dev/null || echo unknown)}"
BACKUP_DIR="${BACKUP_DIR:-$(setting BACKUP_DIR /var/backups/ai-personal-cfo)}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-$(setting BACKUP_RETENTION_DAYS 14)}"
UPLOAD_URL="${BACKUP_UPLOAD_URL:-$(setting BACKUP_UPLOAD_URL)}"
DATABASE="$(setting POSTGRES_DB)"
USER_NAME="$(setting POSTGRES_USER)"
NAME="cfo-$(date -u +%Y%m%dT%H%M%SZ).dump"
PARTIAL="$BACKUP_DIR/.$NAME.partial"

mkdir -p "$BACKUP_DIR"
trap 'rm -f "$PARTIAL"' EXIT

compose exec -T postgres pg_dump --username "$USER_NAME" --dbname "$DATABASE" \
  --format=custom --no-owner --no-privileges >"$PARTIAL"

OBJECTS="$(compose exec -T postgres pg_restore --list <"$PARTIAL" | grep -c 'TABLE DATA' || true)"
[ "$OBJECTS" -gt 0 ] || fail "the dump contains no table data; nothing was kept"

mv "$PARTIAL" "$BACKUP_DIR/$NAME"
log "written file=$BACKUP_DIR/$NAME tables=$OBJECTS bytes=$(wc -c <"$BACKUP_DIR/$NAME" | tr -d ' ')"

if [ -n "$UPLOAD_URL" ]; then
  if curl --fail --silent --show-error --max-time 300 --upload-file "$BACKUP_DIR/$NAME" \
    "${UPLOAD_URL%/}/$NAME" >/dev/null; then
    log "uploaded file=$NAME"
  else
    fail "upload failed; the local copy was kept"
  fi
else
  log "no BACKUP_UPLOAD_URL set; this backup exists only on this machine"
fi

find "$BACKUP_DIR" -maxdepth 1 -name 'cfo-*.dump' -type f -mtime "+$RETENTION_DAYS" -print -delete |
  while read -r removed; do log "expired file=$removed"; done
