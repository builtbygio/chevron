# Three test runners, and which one new tests should use

**Status:** decision (2026-09-05)
**Related:** [security-phase-s-decision.md](./security-phase-s-decision.md), [build-architecture.md](./build-architecture.md), `.github/workflows/jasmine.yml`, `script/test`

## The question, and the premise behind it

"Is Jasmine still the right tool?" arrived after the Jasmine nightly was
found to have failed 20 of its last 20 runs. The premise is that an
unmaintained framework is why the suite is unreliable, and that a modern
runner would fix it.

Measuring the repository says something different: the framework question
has mostly already been answered, by usage, and the nightly failed for
reasons that had nothing to do with Jasmine.

## What actually runs today

| Layer | Runner | Size | Where it runs |
|---|---|---|---|
| Pure logic and process boundaries | `node:test` | 109 files in `script/ci/` | `unit-and-cpm` job on every PR, ~20 min, no Electron |
| Main-process specs | Mocha 11.8 | 5 files in `spec/main-process/` | Jasmine nightly, `core` shard |
| In-app renderer specs | `jasmine-tagged` 1.1.4 | 73 core specs in `spec/`, 12 package specs | Jasmine nightly, in the packaged app under Xvfb |

Three things stand out.

**Every test written in the last year is `node:test`.** 109 files, zero
dependencies, run on every PR. This was never decided; it is what people
reached for. The IPC boundary tests (`pty-ipc`, `fs-ipc-roots`,
`lsp-command-policy`), the cpm contract tests and the suite-selection test
all live here. The unit job is the actual PR gate.

**`jasmine-tagged` is a fork of Jasmine 1.3, from 2013.** It has no upgrade
path: Jasmine 2 changed the API, and `spec/jasmine-test-runner.js` is
bespoke. Of the 73 core specs, **18 still use `runs()` / `waitsFor()`**, the
pre-Promise async model, and 21 use `async () =>`. The rest are synchronous.

**The package spec count is 12, not 83.** When the bundled packages were
vendored as `builtbygio` forks, 71 of them lost their `spec/` directory.
The nightly could not report this, because it never finished.

## Why the nightly failed, precisely

Not Jasmine. Three harness defects, fixed in #343:

1. `script/test` forced the core main-process suite on Linux regardless of
   `ATOM_RUN_CORE_TESTS=false`, so all nine shards ran it.
2. `spawnTest()` had no timeout. One hung suite held a job to the 120-minute
   cap, and the retry logic could re-run that hang six times.
3. Shards were split across all 83 packages, so three shards drew only
   packages with no specs and had nothing to run.

A different framework with the same harness would have hung the same way.
The framework was a bystander, and any decision here has to be honest about
that, or it will produce a nicer-looking suite that still cannot say when
the editor breaks.

## The decision

### 1. `node:test` is the default for anything that does not need the app

Ratifies what already happened. Pure logic, IPC validation, policy modules,
build scripts. The rule that has paid off repeatedly: **test the boundary,
not the unit**. `lsp-position.test.js` was green throughout a bug where its
functions had zero call sites; `lsp-trust.test.js` was green while the
renderer could grant itself trust. The tests that caught those were the ones
asserting behaviour at the IPC or provider boundary.

No Vitest, no Jest. Neither runs inside Electron, so either would be a
fourth runner with no new capability over `node:test`.

### 2. Playwright's Electron mode for new in-app tests

`_electron.launch()` drives the **real packaged app** from outside over CDP,
which is the mechanism `script/ci/smoke-test.js` and `measure-startup.js`
already use. It gains, over in-app Jasmine:

- runs against the actual build, on the same five-platform matrix that
  already produces it, rather than a Linux-only nightly
- **trace and video on failure**, which is the direct answer to "shard
  hung, no output"
- per-test timeouts are native, not bolted onto `spawnTest()`
- tests describe what a user does (open a file, type, expect the completion
  popup) instead of internal APIs, so they survive refactors

It is a dependency the unit job must not pull in; it belongs beside the
packaged-app smoke test, gated on a build.

### 3. Mocha stays for main-process specs

Five files, modern version, no problem to solve. Folding them into
`node:test` would be tidy and is not worth a PR on its own; do it when one
of them next needs real changes.

### 4. Jasmine is retired incrementally, `runs/waitsFor` first

- The 18 `runs()` / `waitsFor()` specs are the hang risk. Convert them to
  `async/await` as they are touched; convert the whole set before the
  nightly is made a PR gate.
- The other 55 core specs are left alone until they break or block
  something. They work, and a rewrite for its own sake is how a year goes
  by with no new coverage.
- `jasmine-tagged` is removed when the last spec is gone, not before.

### 5. Coverage before runner

Restoring specs for the 71 packages that lost them outranks every item
above. A modern runner over 15% of the packages is worth less than a 2013
runner over all of them. This is tracked separately; it is named here so
the runner work is not mistaken for the coverage work.

## What this rules out

- A big-bang migration of the 85 in-app specs to any framework.
- Adding a runner for unit tests other than `node:test`.
- Making the Jasmine nightly a PR gate before the `runs/waitsFor` specs are
  gone and the package coverage gap is closed. Until then it is diagnostic,
  and #343 makes it produce a result rather than a cancellation.

## Sequencing

| Step | Gate |
|---|---|
| #343 lands; nightly completes and attributes failures | next scheduled run is not cancelled |
| Restore package specs, starting with the packages CI builds already exercise | per package |
| First Playwright Electron test beside the smoke test, on the build matrix | one passing test on all five platforms |
| Convert the 18 `runs/waitsFor` specs | zero remaining |
| Promote nightly to a PR gate | above two complete |
| Remove `jasmine-tagged` | zero Jasmine specs |
