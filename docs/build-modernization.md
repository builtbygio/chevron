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

## Stream B — Patch retirement (in progress)

| Item | Status |
|------|--------|
| Inventory + retirement paths | [bootstrap-patch-matrix.md](./bootstrap-patch-matrix.md) |
| Fold decaff/debabel into pins | Open — when atom/* pins ship precompiled JS |
| Nested `nan` under keytar only (2.14) | Still needs `patch-keytar-nan` |
| Safety-net IPC patches | Keep until always zero-diff |

Do **not** delete Class A patches until Electron/native pins prove green without them.

## Stream D — Packaging / snapshot (policy)

| Item | Status |
|------|--------|
| Custom V8 startup snapshot on Electron **≥43** | **Skipped by default** (generator SIGTRAP); stock Electron snapshots |
| Force attempt | `CHEVRON_FORCE_MKSNAPSHOT=1` |
| electron-packager | Retained (Atom-era); migration to a newer packager is a separate project |
| apm in product | **cpm only**; `apm` name is a shim; `--with-apm` debug-only |

See `script/lib/generate-startup-snapshot.js` and [startup-snapshot-plan.md](./startup-snapshot-plan.md).

## Stream E — Dependency graph (ongoing)

| Item | Status |
|------|--------|
| `--legacy-peer-deps` on app install | Still required for Atom-era peers |
| Git pins vs semver | Prefer owned releases over time ([owned-package-modernization-checklist.md](./owned-package-modernization-checklist.md)) |
| SCA | [sca-runtime-inventory.md](./sca-runtime-inventory.md) — not a bootstrap gate yet |

## Daily commands

```bash
nvm use                          # .nvmrc → 24
./script/bootstrap-modern        # or --ci
./script/with-modern-env ./script/build --no-bootstrap
```

Do **not** run stock `./script/bootstrap` on modern hosts (it exits with instructions).
