# cpm Phase 4 — retire classic apm from the product

**Date:** 2026-07-21  
**Status:** Done when PR merges

## What changed

| Before | After |
|--------|--------|
| Package app copied `apm/node_modules/atom-package-manager` | Package app copies **`cpm/` only** |
| CI `bootstrap-modern --ci --with-apm` | CI `bootstrap-modern --ci` (no Node 12 apm) |
| Linux deb/rpm/install-from-source linked classic apm | Links **`app/cpm/bin/apm`** (+ `cpm`) |
| `getApmPath` fell back to classic tree | Prefers cpm; legacy path is shim layout only |

## Compatibility

- Command name **`apm`** still works → **cpm** (rebuild contract, scripts, PATH).
- Tiny **`app/apm/...`** stubs in the package redirect to cpm so old relative paths do not hard-fail.
- Monorepo folder `apm/` is **historical** (see `apm/README.md`); optional `--with-apm` for debugging only.

## Not deleted (yet)

- Source tree `apm/package.json` pin of `atom-package-manager` (optional later cleanup).
- Patch scripts `patch-apm-*` (only used with `--with-apm`).

## Phases

0–4 complete for the cpm roadmap in design. Optional follow-ups: remove monorepo `apm/` directory entirely; settings-view registry UI polish.
