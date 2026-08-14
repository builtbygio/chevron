# Jasmine CI (#57)

The in-app suite is `script/test`. It boots the packaged binary and runs
Jasmine (renderer) plus mocha (main process). That is **not** the fast
`node --test script/ci/*` job.

## What runs where

| Path | When | What |
|------|------|------|
| `unit-and-cpm` | every PR / push | `cpm` tests + `script/ci/*.test.js` (no packaged app) |
| Linux x64 smoke | every code PR | `script/ci/smoke-test.js` |
| **Jasmine nightly** | 04:00 UTC on `master` | full `script/test` (core + packages) |
| **Jasmine dispatch** | Actions → Jasmine → Run workflow | same as nightly |
| **Opt-in on CI** | workflow_dispatch `run_full_core_tests`, or PR label `jasmine` | same suite after Linux x64 build + smoke |

Jasmine is **not** a required PR check. A red nightly means the suite failed
on `master`; it does not block merges.

## Full suite env

`script/test` with no flags on Linux only runs **core main-process** mocha
(historical OS override). The full suite needs:

```bash
export ATOM_RUN_CORE_TESTS=true    # main + every spec/*-spec.js
export ATOM_RUN_PACKAGE_TESTS=true # bundled package spec/test folders
./script/with-modern-env ./script/test
```

Needs a packaged app (`script/build`). The runner looks for
`out/Chevron-linux-<arch>/chevron` (not `atom-*/atom`).

On CI, `xvfb-run -a` provides a display. `--no-sandbox` is added automatically
when `CI=1` on Linux.

## Runtime budget

| Step | Expected |
|------|----------|
| Bootstrap + Linux build | 20–50 min (warm cache) |
| Full Jasmine | **unknown until first nightly** — budget **up to ~3 h** |
| Workflow timeout | 240 min |

Split (historical VSTS) is still in `script/test` via
`ATOM_RUN_CORE_RENDER_TESTS=1|2` and `ATOM_RUN_PACKAGE_TESTS=1|2`. Nightly
runs the whole thing on one Linux x64 box on purpose (simpler; measure first).

## Expected flakes / first-run redness

Treat the first several nightlies as **measurement**, not a product failure.

First nightly (`71d4856b0`, 2026-08-14) was red for **two systematic reasons**, not 80 package bugs:

1. **Renderer:** `jasmine-tagged` → `jasmine-node/reporter` required `failure-tree.coffee`. Chevron does not transpile Coffee (#62). The runner now copies `spec/support/jasmine-node-failure-tree.js` next to that file.
2. **Core main (16 / 125):** `AtomWindow` tests constructed windows without `resourcePath` (`path.join(undefined, …)`), and one title assertion still expected `Atom` instead of `Chevron`.

Remaining redness after those fixes is real spec debt (Atom paths, Xvfb, timeouts, `rg`/`cpm`, github signatures):

- Renderer specs that assume Atom paths, `atom://`, or `require('atom')` only
- Display / Xvfb / ozone (we force `ELECTRON_OZONE_PLATFORM_HINT=x11`)
- Timeouts (the runner retries timeout-looking stderr up to 6 times)
- Package specs that spawn `rg` (bootstrap now downloads vscode-ripgrep)
- settings-view specs that spawn `cpm`/`apm`
- GitHub package update-signature errors (already treated as retryable)

JUnit XML (if Jasmine writes it) uploads as the `jasmine-junit-linux-x64`
artifact. Use that plus the job log to list real failures in #57.

## Local

```bash
./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap
# main-process only (Linux default):
./script/with-modern-env ./script/test
# full:
ATOM_RUN_CORE_TESTS=true ATOM_RUN_PACKAGE_TESTS=true \
  ./script/with-modern-env ./script/test
```
