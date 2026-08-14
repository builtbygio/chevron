# Build modernization (Streams A–E)

Follow-up to the 2026-08-08 build audit. Work order: **A → C → B → D/E**.

## Stream A — Bootstrap contract (landed)

| Item | Status |
|------|--------|
| Node **20–24** / Python **3.11–3.13** gate | `script/lib/verify-machine-requirements.js` |
| Critical native **hard fail** after rebuild | `script/bootstrap-modern` + `script/lib/critical-natives.js` |
| Override for local experiments | `CHEVRON_ALLOW_NATIVE_REBUILD_FAILURES=1` |
| Patch matrix doc | [bootstrap-patch-matrix.md](./bootstrap-patch-matrix.md) |
| Unit tests | `script/ci/bootstrap-contract.test.js` |

## Stream C — Build hygiene (landed)

| Item | Status |
|------|--------|
| Silent no-op Coffee/Babel build transpile | `transpile-*-paths.js` no longer spam logs |
| Contributor entry docs | This file + refreshed bootstrap pointers |
| Atom-era `build-status.md` | Replaced with Chevron CI pointer |

## Stream B — Patch retirement (this stream)

| Item | Status |
|------|--------|
| Inventory + retirement paths | [bootstrap-patch-matrix.md](./bootstrap-patch-matrix.md) |
| Frozen Class C sets | **Empty** — folded into owned pins; inventory + CI assert no leftover trees |
| Nested `nan` (keytar 2.14) | **Root `overrides.nan=2.28.0`** — lockfile no longer nests 2.14 |
| Safety-net IPC patches | Kept (zero-diff / already-ok logs); not deleted |
| Fold decaff/debabel into pins | **Done** — owned SHA bumps; bootstrap no longer patches Coffee/babel-prefix |

Do **not** delete Class A compile patches until Electron/native pins prove green without them.

## Stream D — Packaging / snapshot

| Item | Status |
|------|--------|
| Policy module | `script/lib/packaging-policy.js` + [packaging.md](./packaging.md) |
| Custom V8 snapshot on Electron **≥43** | **Skipped by default**; `out/STOCK_V8_SNAPSHOT.txt` marker |
| Force attempt | `CHEVRON_FORCE_MKSNAPSHOT=1` |
| electron-packager | **Retained** 15.x (no `@electron/packager` swap) |
| apm in product | **cpm only** |

See `script/lib/generate-startup-snapshot.js` and [startup-snapshot-plan.md](./startup-snapshot-plan.md).

## Stream E — Dependency graph

| Item | Status |
|------|--------|
| Classifier + CI | `script/lib/dep-graph.js` + `script/ci/dep-graph.test.js` |
| `atom/*` git ceiling | **0** (#79 closed) |
| `--legacy-peer-deps` | Still required; documented in [dependency-graph.md](./dependency-graph.md) |
| SCA | [sca-runtime-inventory.md](./sca-runtime-inventory.md) — not a bootstrap gate |

## Daily commands

```bash
nvm use                          # .nvmrc → 24
./script/bootstrap-modern        # or --ci
./script/with-modern-env ./script/build --no-bootstrap
```

Do **not** run stock `./script/bootstrap` on modern hosts (it exits with instructions).
