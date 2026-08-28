# cpm Phase 4 — retire classic apm from the product

**Date:** 2026-07-21  
**Status:** **Done** — merged as [#30](https://github.com/builtbygio/chevron/pull/30)

## What changed

| Before | After |
|--------|--------|
| Package app copied `apm/node_modules/atom-package-manager` | Package app copies **`cpm/` only** |
| CI `bootstrap-modern --ci --with-apm` | CI `bootstrap-modern --ci` (no Node 12 apm) |
| Linux deb/rpm/install-from-source linked classic apm | Links **`app/cpm/bin/apm`** (+ `cpm`) |
| `getApmPath` fell back to classic tree | Prefers cpm; legacy path is shim layout only |

## Compatibility

- Command name **`apm`** still works → **cpm** (rebuild contract, scripts, PATH).
- Tiny **`app/apm/...`** launcher scripts in the package redirect to cpm (real files, not broken relative symlinks).
- Monorepo folder `apm/` is **historical** (see `apm/README.md`); optional `--with-apm` for debugging only.

## Follow-ups landed in closeout

- User-facing Welcome/Guide copy reflects cpm shipping.
- Secondary build/test tooling uses **host npm** / monorepo **cpm** shims (not classic apm).
- Cutover guide: [cpm-cutover.md](../orientation/cpm-cutover.md).

## Not deleted (intentionally)

- Source tree `apm/package.json` pin of `atom-package-manager` for optional archaeology.
- `--with-apm` still installs that tree with `--ignore-scripts` (debug only). The `patch-apm-*` scripts are **deleted** — this path is not a working product bootstrap.

## Phases

**0–4 complete.** Authoritative design: [cpm-design.md](../reference/cpm-design.md).
