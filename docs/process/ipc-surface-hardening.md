# IPC surface hardening — inventory, then validation, then names

**Status:** plan (2026-09-05) — written to be executed by another agent without this conversation
**Related:** [security-phase-s-decision.md](../decisions/security-phase-s-decision.md), [security-phase-n3.md](./security-phase-n3.md), [REBRANDING.md](../decisions/REBRANDING.md), `static/preload.js`

## Corrections to the audit that prompted this

The repository audit said "91 `ipcMain` handlers, no sender validation, no
inventory guard." Measured properly, two of those three are wrong or
imprecise, and the plan below is built on the corrected numbers.

**There are 83 registrations, not 91.** The audit counted every `ipcMain.`
line; only `ipcMain.handle(` and `ipcMain.on(` register a channel.

| File | Registrations |
|---|---|
| `src/main-process/register-renderer-ipc.js` | 64 |
| `src/main-process/register-fs-ipc.js` | 16 |
| `src/main-process/register-pty-ipc.js` | 4 |
| `src/main-process/atom-application.js` | 3 |
| `src/main-process/register-rg-ipc.js` | 2 |
| `src/main-process/atom-window.js` | 1 |

**"No sender validation" was the wrong frame for this architecture.** In a
typical Electron app, sender validation means checking `senderFrame.url`
so an iframe or guest cannot call privileged channels. Here that risk is
already closed by construction:

- The page world is an empty shell with no Node and no `contextBridge`.
- Guest `<webview>`s get no preload (`atom-window.js`
  `will-attach-webview` deletes it), so they cannot reach `ipcRenderer`.
- The **preload world** is the only sender, and it runs all of Atom plus
  every package with full Node and `electron`.

That last point is the actual finding. **Every package can call every one of
the 83 channels directly**, because packages run in the same world as core.
The IPC surface *is* the package privilege surface, and it is enforced only
by what each handler chooses to check. `child_process` is on the package
denylist; an IPC channel that spawns is a way around it unless the handler
validates. That is exactly how the LSP `start-server` escalation happened.

**What does exist is uneven.** 31 `event.sender` references, and the newer
files check ownership consistently — pty and rg pass the sender to a manager
that scopes resources to it; utility-worker channels check
`meta.managerWcId !== event.sender.id`; fs-ipc constrains paths to roots.
The `atom-web-contents-call-sync` proxy that looked like a generic
method-call hole is allowlisted to six clipboard/undo methods. The unaudited
mass is the **56 `atom*` legacy channels** in `register-renderer-ipc.js`,
migrated from `electron.remote` during the Electron 14→43 ladder with
behaviour preserved and validation added ad hoc.

**"No inventory guard" is correct**, and it is the root of the rest. A new
`ipcMain.handle` can be added in any PR with nothing that asks whether it
validates its payload, scopes to its window, or is named consistently. Three
channels have no namespace at all.

## The plan

Five phases. Phases 0–2 are mechanical and low-risk; do them first and in
order. Phase 3 is the real work and is sized in batches. Phase 4 is
deferred by design.

Rules that apply to every phase:

- **Do not change any handler's behaviour in Phases 0–2.** Those phases add
  tests and shared helpers only. A behaviour change belongs in Phase 3 with
  its own test.
- **Do not introduce `contextBridge`.** The preload-world boot is deliberate
  (see the header of `static/preload.js`); packages need `require`. Moving
  packages out of that world is package host v2, a separate track.
- **Do not rename channels before Phase 4**, and never without an alias.
  Bundled packages call these by string.
- Every PR runs `node --test script/ci/ipc-inventory.test.js` green, and
  the unit job (`unit-and-cpm` in `.github/workflows/ci.yml`) must stay
  free of `script/node_modules` and root `node_modules` dependencies.

### Phase 0 — enumerate, and make the enumeration a test

**Goal:** the list of channels is a checked-in artefact, and adding one
without updating it fails CI.

1. Create `script/lib/ipc-inventory.js` exporting `enumerateChannels(rootDir)`.
   It walks `src/main-process/**/*.js`, and for each `ipcMain.handle(` or
   `ipcMain.on(` call returns `{ channel, kind: 'handle'|'on', file, line }`.
   Static regex is sufficient; every registration in the codebase uses a
   string literal as the first argument. Verify that claim with:

   ```bash
   grep -rn "ipcMain\.\(handle\|on\)(" src/main-process | grep -v "ipcMain\.\(handle\|on\)(['\"]"
   ```

   The expected output is empty. If it is not, those sites are the first
   thing to fix (make the channel a literal), before anything else.

2. Create `script/ci/ipc-inventory.json`: the output of step 1, sorted by
   channel, with two extra fields per entry that Phase 1 fills in and
   Phase 0 leaves as `null`: `"scope"` and `"validation"`.

3. Create `script/ci/ipc-inventory.test.js` with three assertions:
   - the live enumeration equals the JSON on `channel`, `kind`, `file`
     (line numbers excluded — they churn);
   - every channel matches `/^(atom[-:]|lsp:|chevron:)/`, **except** an
     explicit `GRANDFATHERED` set containing the three unprefixed channels
     found today. Adding a fourth fails;
   - no channel appears twice.

   The failure message for the first assertion must print the diff and the
   sentence: *"New IPC channel: add it to script/ci/ipc-inventory.json with
   scope and validation filled in, and a boundary test."* This message is
   the guard.

4. Add the test to the `unit-and-cpm` job's `node --test` list in
   `.github/workflows/ci.yml`.

**Acceptance:** 83 entries; test green; deleting one line from the JSON
turns it red with the guard message.

### Phase 1 — classify every channel

**Goal:** every entry in the JSON has `scope` and `validation` filled in,
from reading the handler, not guessing.

Values:

| Field | Values | Meaning |
|---|---|---|
| `scope` | `"owner-window"` | handler only acts on the sender's own window / resources it created |
| | `"any-window"` | handler acts on a window or resource chosen by the payload |
| | `"global"` | handler affects app-wide state (config, protocol client, quit) |
| `validation` | `"full"` | every payload field is type/range/path checked before use |
| | `"partial"` | some fields checked |
| | `"none"` | payload used as received |
| `effect` | one or more of `read`, `write-fs`, `spawn`, `network`, `dialog`, `eval`, `ui` | what the handler can do — this decides Phase 3 ordering |

Do this file by file, smallest first (`atom-window.js`, `rg`, `atom-application.js`,
`pty`, `fs`, then `register-renderer-ipc.js`). For the 64 in
`register-renderer-ipc.js`, work top to bottom and commit every ~15
entries so the diff stays reviewable. Add the `effect` field to the test's
schema check.

**Acceptance:** no `null` fields; a summary table in the PR body giving
counts per `validation` value and per `effect`. That table is the
prioritised worklist for Phase 3.

### Phase 2 — one guard module, extracted from what already works

**Goal:** stop each file re-implementing the same checks.

Create `src/main-process/ipc-guard.js` by **extracting**, not rewriting,
the validators that already exist:

- from `register-pty-ipc.js`: `validateArgs` (nul-free string array), the
  cwd-inside-roots check, `sanitizeEnv` (allowlist pattern);
- from `register-fs-ipc.js`: absolute, nul-free path inside allowed roots;
- from `register-renderer-ipc.js`: `browserWindowFromEvent`, and the
  `managerWcId === event.sender.id` ownership check, generalised as
  `requireOwner(event, resourceMeta)`.

Export small named functions (`requireString`, `requireInt(min,max)`,
`requireAbsolutePath(roots)`, `requireOwnerWindow(event)`,
`requireOwner(event, meta)`). Each returns `{ ok, reason }` like the pty
validators do, so handlers stay uniform. Give the module its own
`script/ci/ipc-guard.test.js` covering the refusal cases, and switch pty
and fs to import from it **with their existing tests unchanged and green**
— that is the proof the extraction preserved behaviour.

**Acceptance:** `pty-ipc.test.js`, `fs-ipc-roots.test.js`, `rg-ipc.test.js`
unchanged and green; no duplicate validator bodies remain in those files.

### Phase 3 — validate the legacy `atom*` channels, highest effect first

**Goal:** every channel is `validation: "full"`.

Order by `effect` from Phase 1: `spawn` and `eval` first, then `write-fs`,
`dialog`, `network`, then `ui`/`read`. Within a batch, `scope: "any-window"`
before `"owner-window"`.

For each handler:

1. Add validation using `ipc-guard.js`. Refuse with a reason; never
   silently coerce. An `on` handler that cannot return an error should
   `console.warn` and return.
2. Write a boundary test in the style of `script/ci/pty-ipc.test.js`: call
   the handler with a bad payload and assert refusal, then with a good one
   and assert the effect. Do not test the framework; test the refusal.
3. Flip the JSON entry to `"full"`. The inventory test should assert that
   `validation` never moves *away* from `"full"`.

Batch size: **10 channels per PR**, one effect category per PR where
possible. Six PRs covers the 56. Do not combine with Phase 4 renames.

**Acceptance per PR:** every touched channel has a test that fails if the
validation is removed (verify by reverting the guard locally once).
**Acceptance overall:** `validation: "none"` count is zero.

### Phase 4 — namespace, deferred until Phase 3 is done

56 channels are `atom*`, 11 `chevron:*`, 13 `lsp:*`, 3 unprefixed. The
Chevron-only policy in REBRANDING.md says new surfaces use `chevron`; these
predate it. Renaming is cheap in main and expensive everywhere else, because
bundled packages call channels by string.

When Phase 3 is complete: register each `atom*` channel under its
`chevron:` name and keep the old name as an alias that logs once per
session, for one release. The inventory test then enforces that new
channels are `chevron:` or `lsp:` only. Remove aliases the release after.
Not before.

## What this does not do

- It does not move packages out of the preload world. That is package host
  v2 (`security-phase-s-package-host.md`). When that lands, `ipcRenderer`
  stops being reachable from package code, and this inventory becomes the
  documented RPC contract the host exposes instead — which is why the JSON
  carries `scope` and `effect`, not just names.
- It does not add `senderFrame` checks. There is no untrusted frame that
  can send; adding the check would be cargo cult.

## Where to start

Phase 0, step 1. Run the grep, confirm it is empty, write the enumerator,
run it, and compare its count to the table at the top of this document. If
it says 83, the plan is on solid ground. If it does not, stop and find out
why before writing the JSON.
