#!/bin/sh
# Prefer cpm apm shim (Phase 1); fall back to classic apm.
DIR="$(dirname "$0")"
if [ -x "$DIR/../app/cpm/bin/apm" ]; then
  exec "$DIR/../app/cpm/bin/apm" "$@"
fi
exec "$DIR/../app/apm/bin/apm" "$@"
