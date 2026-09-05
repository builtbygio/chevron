# Test-runner migration — executing the decision

**Status:** plan (2026-09-05) — written to be executed by another agent without this conversation
**Decision it executes:** [test-runner-strategy.md](../decisions/test-runner-strategy.md)
**Related:** `.github/workflows/jasmine.yml`, `script/test`, `script/lib/select-test-suites.js`, `script/ci/smoke-test.js`, [ipc-surface-hardening.md](./ipc-surface-hardening.md)

## What the decision fixed, and what it left to do

The decision ratified `node:test` for unit work, chose Playwright's Electron
mode for new in-app tests, and retires Jasmine 1.3 incrementally. It ranked
**coverage above runner**: 71 of 83 vendored packages have no specs. This
document turns those into phases with commands and acceptance criteria.

Measured inputs the phases rely on:

| Fact | Value | How to re-measure |
|---|---|---|
| Packages with no `spec/` or `test/` | 71 of 83 | command in Phase 1, step 1 |
| Core specs using `runs()` / `waitsFor()` | 18 files, 367 call sites | `grep -c "waitsFor\|runs(" spec/*-spec.js` |
| Two files hold 70% of those | `workspace-spec.js` 175, `project-spec.js` 84 | same |
| `waitsForPromise` uses | 164 | `grep -o waitsForPromise spec/*-spec.js \| wc -l` |
| `advanceClock` uses (Jasmine 1.3 mock clock) | 35 | same pattern |
| Playwright in any `package.json` | no | `grep -rn playwright package.json script/package.json` |
| How the smoke test drives the app | spawns the binary with `--remote-debugging-port`, talks CDP over `ws` | `script/ci/smoke-test.js` ~L1690–1720 |

**Why the specs are missing.** Before #235 vendored the packages, they were
declared as **npm tarballs** (`"tabs": "npm:@builtbygio/tabs@0.110.5"`).
Published tarballs exclude `spec/` via `files`/`.npmignore`, so the specs
were never in what got copied. The upstream repositories still have them.
`git show abf24c3bc^:package.json` shows the version each package was at;
that version's tag in `builtbygio/<pkg>` (or `atom/<pkg>` where the fork
has none) is where the specs come from.

Rules for every phase:

- The `unit-and-cpm` job in `.github/workflows/ci.yml` must stay free of
  root and `script/` `node_modules`. Anything needing the packaged app
  runs in a build job, never there.
- `script/ci/jasmine-suite-selection.test.js` must stay green. If a phase
  changes how suites are chosen, change `script/lib/select-test-suites.js`
  and its test together.
- One phase per PR at most. Phases 1 and 3 are further batched below.
- Do not delete `jasmine-tagged` or `spec/jasmine-test-runner.js` before
  Phase 5. Nothing else depends on the order between Phases 1–4.

### Phase 0 — confirm the nightly now produces a result

**Goal:** the harness fix (#343) is verified before anything is built on it.

1. Trigger `Jasmine` via `workflow_dispatch` with `packages` empty, or wait
   for the next 04:00 UTC run.
2. Every job must reach **Upload JUnit** with a real file, and no job may
   end `cancelled`. Red is acceptable; cancelled is not.
3. Record which suites the watchdog killed (`exceeded … and was killed` in
   the log). That list is input to Phase 3 ordering.

**Acceptance:** zero cancelled jobs; JUnit artefact present for every shard.
If any job is cancelled, the harness is still wrong — fix that first.

### Phase 1 — restore package specs from upstream

**Goal:** the 71 packages get their `spec/` back, from the version they
were vendored at.

1. Produce the list and the version each was vendored at:

   ```bash
   node -e '
     const fs = require("fs");
     const now = require("./package.json");
     const pins = JSON.parse(require("child_process")
       .execSync("git show abf24c3bc^:package.json")).dependencies;
     for (const p of Object.keys(now.packageDependencies).sort()) {
       if (["spec","test"].some(d => fs.existsSync(`packages/${p}/${d}`))) continue;
       const pin = String(pins[p] || "");
       const version = (pin.match(/@(\d[^@]*)$/) || [])[1] || "";
       const repo = (JSON.parse(fs.readFileSync(`packages/${p}/package.json`)).repository || {});
       console.log([p, version, repo.url || repo || ""].join("\t"));
     }' > /tmp/missing-specs.tsv
   wc -l /tmp/missing-specs.tsv   # expect 71
   ```

2. For each row, fetch `spec/` from the repository at tag `v<version>`,
   falling back to the default branch when that tag does not exist, and
   falling back to `atom/<pkg>` when `builtbygio/<pkg>` has no `spec/` at
   all. Write this as `script/restore-package-specs.sh` so it is
   re-runnable; it must print, per package, one of `restored (tag)`,
   `restored (default branch)`, `restored (atom upstream)`, or
   `no upstream spec`. Use `git clone --depth 1 --branch v<version>` and
   copy only `spec/`; do not copy `lib/` or `package.json`.

3. Packages reported `no upstream spec` never had tests. List them in the
   PR body and stop there — writing new specs is not this phase.

4. Run each restored spec directory once locally against the packaged app
   before committing it:

   ```bash
   ATOM_RUN_CORE_TESTS=false ATOM_RUN_PACKAGE_TESTS=true \
   ATOM_PACKAGES_TO_TEST=<pkg> SPEC_SUITE_TIMEOUT_MS=600000 \
     ./script/with-modern-env ./script/test
   ```

   A spec that fails because it references upstream APIs Chevron renamed
   (`atom.` → `chevron.`, see REBRANDING.md) is fixed in place. A spec that
   fails for a reason that looks like a real bug is committed as-is with a
   `// FIXME(restored-spec): <one line>` at the top and noted in the PR
   body — the point is to *see* the failures, not to hide them.

**Batching:** 10 packages per PR, alphabetical. The jasmine workflow's
shard computation already filters to packages that have specs, so restored
packages join the nightly automatically.

**Acceptance per PR:** every restored package appears in the next nightly's
shard list (`shard packages-N: …` line in the log). **Overall:** the
"no `spec/` or `test/`" count equals the `no upstream spec` count.

### Phase 2 — first Playwright Electron test, beside the smoke test

**Goal:** one real-app test on all five CI platforms, so the pattern exists.

1. Add `@playwright/test` and `playwright` to `script/package.json` (not
   root — root deps ship in the app). Pin exact versions.

2. Create `script/e2e/` with a `playwright.config.js` whose `testDir` is
   `script/e2e`, `retries: 0`, `timeout: 60_000`, and `use: { trace:
   'retain-on-failure', video: 'retain-on-failure' }`. Report to a
   directory under `${RUNNER_TEMP}` in CI.

3. Write `script/e2e/launch.js` exporting `launchChevron()`: uses
   `_electron.launch({ executablePath, args: [...] , env: {...} })` with the
   binary from `script/lib/find-packaged-app.js`, a fresh `CHEVRON_HOME`
   from `script/lib/temp-dir.js`, and `--user-data-dir` under it — the
   same shape `smoke-test.js` uses at L1690–1720. Return `{ app, window,
   home }`, where `window` is `await app.firstWindow()`.

4. The first test, `script/e2e/startup.spec.js`: launch, wait for the
   workspace (`window.locator('atom-workspace, chevron-workspace')`
   visible), assert the title contains `Chevron`, close. That is all. It
   proves launch, wait, assertion, teardown, and artefact capture.

5. Wire it into **each build job** in `ci.yml` as a step after
   **Launch smoke test**, Linux under `xvfb-run -a`:

   ```yaml
   - name: Playwright e2e
     run: npx --prefix script playwright test --config script/e2e/playwright.config.js
   - uses: actions/upload-artifact@v6
     if: failure()
     with:
       name: playwright-${{ runner.os }}-${{ runner.arch }}
       path: ${{ runner.temp }}/playwright-report
   ```

   Do not add it to `unit-and-cpm`.

**Acceptance:** green on macOS x64/arm64, Linux x64/arm64, Windows x64.
Break the assertion once locally and confirm a trace zip is produced.

### Phase 3 — convert the 18 `runs()` / `waitsFor()` specs

**Goal:** zero uses of the Jasmine 1.3 async model in `spec/`.

The mechanical mapping. `waitsForPromise` (`spec/spec-helper.js:337`) and
`conditionPromise` (`spec/async-spec-helpers.js:1`) already exist, so most
conversions are local rewrites:

| Before | After |
|---|---|
| `waitsForPromise(() => p)` | `await p` |
| `waitsFor(() => cond)` | `await conditionPromise(() => cond)` |
| `waitsFor('label', () => cond)` | `await conditionPromise(() => cond, 'label')` |
| `runs(() => { A })` | `A` inline, in sequence |
| `it('…', () => { runs…; waits…; runs… })` | `it('…', async () => { … })` |

`advanceClock` (35 uses) drives Jasmine 1.3's mock clock and does **not**
convert mechanically. In a converted `async` spec, an `advanceClock` inside
what was a `runs()` still works only if nothing awaits a real timer between
it and the assertion. Convert those specs last, one at a time, and run each
one three times locally to catch order-dependence.

**Order:** the 16 small files first (1–12 sites each; one PR for all of
them), then `project-spec.js` (84 sites, one PR), then `workspace-spec.js`
(175 sites, one PR, possibly split by top-level `describe`). Cross-reference
Phase 0's watchdog-kill list: anything on it moves to the front.

**Acceptance per PR:** `grep -c "waitsFor\|runs(" <file>` is 0 for each
touched file, and the file passes locally three consecutive times with
`SPEC_SUITE_TIMEOUT_MS=600000`. **Overall:** the grep across `spec/*-spec.js`
totals 0.

### Phase 4 — promote the nightly to a PR gate

**Goal:** the in-app suite blocks merges.

Preconditions, all three: Phase 0 acceptance held for seven consecutive
nightlies; Phase 1 overall acceptance; Phase 3 overall acceptance.

1. Add a `jasmine` job to `ci.yml` that reuses the `jasmine.yml` steps via
   `workflow_call`, gated by `needs: changes` and `if:
   needs.changes.outputs.code == 'true'` like the build matrix. Keep the
   nightly for the full run; the PR gate runs the `core` shard plus the
   package shards for packages changed in the PR (extend the
   `changes` job to output the list).
2. Mark it required in branch protection only after five consecutive green
   PR runs.

**Acceptance:** a PR that breaks a core spec is blocked.

### Phase 5 — remove `jasmine-tagged`

**Goal:** one in-app runner.

Preconditions: Phase 4 done, and every spec that still needs an in-app
runner has either been converted to Playwright or deliberately kept — a
deliberate keep means the Jasmine 1.3 runner stays and this phase does
not run. Decide that explicitly in a one-paragraph addendum to the
decision doc before starting.

If proceeding: remove `jasmine-tagged`, `jasmine-json`, `jasmine-reporters`
from `package.json`; delete `spec/jasmine-test-runner.js` and the
`--test` main-process path that loads it; delete `spec/spec-helper.js`
helpers nothing uses. `script/lib/select-test-suites.js` loses the
core-render and package suites and its test is updated in the same PR.

## What this does not do

- It does not write new specs for packages that never had them. Those are
  listed by Phase 1 and are a product decision per package.
- It does not migrate the 55 non-`runs/waitsFor` core specs off Jasmine.
  They work. Phase 5 says when that question gets asked.
- It does not add Vitest or Jest anywhere.

## Where to start

Phase 0 needs no code: check the most recent `Jasmine` workflow run. If
any job ended `cancelled`, stop and fix the harness. If not, Phase 1 step 1
— run the command, confirm it prints 71 lines, and look at the third
column: if most repositories are `builtbygio/*`, the restore script is
straightforward and Phase 1 is a week of mechanical PRs.
