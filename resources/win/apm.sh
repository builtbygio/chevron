#!/bin/sh
# Phase 4: apm is always the cpm compatibility shim.
exec "$(dirname "$0")/../app/cpm/bin/apm" "$@"
