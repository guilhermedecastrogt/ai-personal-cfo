#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
export LOG_SCOPE=rollback
require_env_file

TARGET="${1:-$(cat "$STACK_DIR/.previous-tag" 2>/dev/null || true)}"
[ -n "$TARGET" ] || fail "no previous tag recorded; pass one: rollback.sh <image-tag>"

log "returning to tag=$TARGET (database migrations are not reverted)"
SKIP_PRE_DEPLOY_BACKUP="${SKIP_PRE_DEPLOY_BACKUP:-0}" "$STACK_DIR/scripts/deploy.sh" "$TARGET"
