# GROK.md — Chevron session handoff

Context for the next Grok (or human) session. Prefer this file + CHANGELOG over archaeology.

**Repo:** `builtbygio/chevron` (local: workspace `chevron`)  
**Product:** **Chevron** — modernized Atom fork  
**Date of this handoff:** 2026-08-28 (1.1.0 unsigned preview shipped; Wave 0 contract tests; **Waves 1-4 complete**)

---

## Product vision

| Horizon | Goal |
|---------|------|
| **Near term** | 1.0 dogfood (#106); Jasmine nightly is wired (#57) |
| **Medium term** | Package host v2, Git polish, optional AI |
| **Long term** | Possible Avalonia rehost; keep hackable package spirit |

**Do not** rebase onto Pulsar unless the owner revisits that decision.  
**Chevron only:** product API is `global.chevron` / `require('chevron')` / `engines.chevron` / `~/.chevron`. Atom surfaces are unsupported legacy shims (may be removed). See [docs/decisions/REBRANDING.md](docs/decisions/REBRANDING.md).  
**Packages:** **owned catalog only** for now; sandboxed community packages later (host v2). See [docs/decisions/package-ecosystem-strategy.md](docs/decisions/package-ecosystem-strategy.md).

---

## Current baseline (1.1.0 unsigned preview)

| Item | Value |
|------|--------|
| Version | **1.1.0** (unsigned preview — [docs/reference/releases.md](docs/reference/releases.md)) |
| Electron | **43.1.0** (ladder complete) |
| Package / productName | `chevron` / **Chevron** |
| Bundle ID | `dev.builtbygio.chevron` |
| Security (page) | `contextIsolation: true`, `nodeIntegration: false` |
| Security (preload) | Node + natives; `sandbox: false` (**Phase S Option C** — intentional) |
| Git workers | **utilityProcess** (BW emergency-only) |
| Community packages | Privileged `require` **restricted by default** |
| FS IPC | Strict roots **on** by default (`core.fsIpcStrict`) |
| Telemetry | Off — no metrics/exception-reporting; crash upload forced off |
| Package manager | **cpm** (Electron-as-Node). The `apm` shim is retired. |
| Registry | **Pulsar** (`https://api.pulsar-edit.dev`); `CPM_REGISTRY_URL` override |
| Bootstrap | **pnpm workspaces** + `@electron/rebuild` via `./script/bootstrap-modern` |
| CI | macOS x64/arm64, Linux x64/arm64 (packages + smoke), Windows x64 |
| Catalog | **31** `workspace:@builtbygio/<id>@*` + **83** `npm:@builtbygio/<id>@ver`; **0** git SHA pins |
| Default themes | **One Dark** (`one-dark-ui` / `one-dark-syntax`). `chevron-dark-*` stays bundled |
| Package host v2 | Spine landed; `core.packageHostV2` **default false** |

---

## What's done (recent epics)

### Electron best-practices (P0–P3 shippable) — **complete in 0.6.0**

Authoritative plan (closed): **`docs/process/electron-best-practices-plan.md`**.  
Threat model: **`docs/reference/security-threat-model.md`**.

| Stream | Status |
|--------|--------|
| P0.1 Protocol path confinement | **Done** |
| P0.2 bw-id method + ownership allowlist | **Done** |
| P0.3 wc-send ownership | **Done** |
| P1.1 CSP tighten | **Done** |
| P1.2 Community require restrict default-on | **Done** |
| P1.3 Experimental web features default off | **Done** |
| P1.4 Threat model doc | **Done** |
| P2.1 FS IPC strict roots | **Done** |
| P2.2 sendSync → invoke | **Closed** (inventory only — `docs/reference/remote-ipc-inventory.md` §11) |
| P2.3 `nodeIntegrationInWorker: false` | **Done** |
| P2.4 Guest `file:` roots | **Done** |
| P3.2 Production Electron fuses | **Done** (ASAR integrity macOS-only) |
| P3.4 `certificate-error` deny | **Done** |
| P3.1 utilityProcess workers | **Done** (Phase S3; BW emergency-only) |
| P3.3 Editor `sandbox: true` | **Declined (Option C)** — see security-phase-s-decision.md |

### Electron + remote removal

- Electron ladder → **43.1.0**
- No `@electron/remote`; `src/remote-compat.js` + `register-renderer-ipc.js`
- Preload boot: `static/preload.js` → Atom in isolated world
- Custom elements: `src/create-custom-element.js`
- IPC trust boundary (openExternal scheme allowlist, no executeJavaScript over webContents IPC)

### cpm (Phases 0–4) — **complete**

| Phase | Outcome |
|-------|---------|
| 0 | Host npm for app deps; apm off bootstrap critical path |
| 1 | cpm CLI (install/list/rebuild/…) under Electron-as-Node |
| 2 | Pulsar registry search/view/install-by-name |
| 3 | Prefer native prebuilds before source rebuild |
| 4 | Product ships cpm only; apm name is shim |

Docs: `docs/reference/cpm-design.md`, `docs/orientation/cpm-cutover.md`, `docs/orientation/cpm-prebuilds.md`.

### Branding / packaging

- Chevron identity, icons, dual config home, multi-platform packages (0.2–0.3)
- Settings UI + build patches force Pulsar (not dead atom.io)

### Security Phase N — **complete** (pre-BP)

| Stream | Status |
|--------|--------|
| N0–N5.1 | **Done** (guests sandboxed; package workers hardened; editor stays hackable) |
| Tier-1 package forks | **Pinned** to `builtbygio/*` |
| N2 patches folded into forks | **Done** |
| Nine package libs → TypeScript + zero CoffeeScript first-party | **Done** |
| Phase S | **Complete (Option C)** — `docs/decisions/security-phase-s-decision.md` |

---

## Owned package CI (Option B — monorepo gate)

Tier-1 `builtbygio/*` package repos are **pin sources**, not standalone Atom products.

| Where | What runs |
|-------|-----------|
| **Package fork** | Optional lightweight CI (`package.json` / `repository` / `engines.chevron`). **No** `UziTech/action-setup-atom`, **no** `atom --test`. |
| **Chevron monorepo** | Real gate: `bootstrap-modern` → build → smoke (packages load under Electron 43). Optional later: `script/test --package <name>`. |

Workflow when changing a package:

1. Land commit on `builtbygio/<pkg>`  
2. Bump SHA in Chevron `package.json` + lockfile  
3. Open Chevron PR — CI there is the signal  

---

## What needs to be done next

### 1.0 unsigned preview — **published**

Tag `v1.1.0` (after `v1.0.1`). Docs: [docs/reference/releases.md](docs/reference/releases.md), [docs/process/dogfood-1.0.md](docs/process/dogfood-1.0.md).  
Tracker: **#106**. 1.0.1 mac zips are per-arch (`chevron-mac-x64.zip` / `chevron-mac-arm64.zip`).

Landed with 1.0 / immediately after:

| Item | PR |
|------|-----|
| SCA sanitizer + dugite tar | #103 |
| Class C decaff/debabel folded into owned SHAs | #104 |
| Unsigned preview publish + GitHub Releases update URL | #105 |
| Per-arch mac zip names | #107 |
| Empty tree-view / Open a Project / false `registerElement` deprecation | #108 |
| Defer heavy package preload | #120 |
| Custom V8 snapshot (Linux/Windows; Darwin stock) | #121 |
| Ship ripgrep; cpm ls/outdated; desktop uninstall helper | #122 |
| Colour + own remaining natives + delete bootstrap patches | #123 |
| Modernize those native forks (keep required APIs) | #124 |
| Own remaining loaders + language-* + github CJS; Darwin stock snapshot | #125 |
| Jasmine runner after #62 Coffee removal | #127 |

### Phase S — **complete**

Authoritative: **`docs/process/security-phase-s.md`** + **`docs/decisions/security-phase-s-decision.md`** (Option C).  
Editor `sandbox: false` is intentional; utilityProcess git workers; T2 require restrict.

### LSP — **phases 0–5 landed**

[docs/reference/lsp-design.md](docs/reference/lsp-design.md). Host v2 / more servers later.

### Primary next tracks

Post-1.1.0 modernization continues the architecture doc with wrap-then-delete. **Wave 0:** `script/ci/baseline-1.1.0.test.js` locks One Dark, host v2 off, season, `atom://` alias, and the `Task` export.

1. **Wave 1 — done.** Three parts, all landed:  
   - `Workspace.replace` is off `Task` (`replace-in-files` in-process; export stays). Forces a global regex the way the old worker did.  
   - `sendSync`→`invoke` slice: app jump list + shell beep on `chevron:*` (`script/ci/wave1-ipc-slice.test.js`). `atom-*-sync` twins stay for `remote-compat`. **Clipboard deliberately stays sync** — `atom.clipboard.read()` is synchronous public API. Next mover is `remote-compat` itself, not another getter slice ([remote-ipc-inventory.md](docs/reference/remote-ipc-inventory.md) §11).  
   - Pin `.cson` inventory: **0** across all 94 catalog pins *and* the app tree (`script/ci/pin-cson.test.js` → `pin CSON inventory (Wave 1)`). `season` is no longer a pin reader; its Wave 3 gate is user `.cson` dual-read + third-party package data ([language-stack.md](docs/reference/language-stack.md) *Pin CSON inventory*).  
2. **Wave 2 — complete.** Both items were owned-npm work, published under `@builtbygio`:  
   - **github GraphQL — done.** [builtbygio/github#16](https://github.com/builtbygio/github/pull/16) + [#17](https://github.com/builtbygio/github/pull/17) merged, `@builtbygio/github@0.37.13` published, pin + lockfile bumped here. 8B had already replaced Relay with `graphql-client` + `GraphQLQuery`; the old layer was dead weight (`relay-network-layer-manager.js` requires `relay-runtime`, never a dependency; 76 `__generated__` artifacts; `graphql@14` required by nothing; a 655 KB `schema.graphql` feeding relay-compiler). Tarball **510 → 423 files, 3.30 → 1.9 MB unpacked**; `graphql@14.5.8` is out of the lockfile entirely. Kept `lib/relay-stub.js` (live 8B code) and `graphql/recovered/` (read at runtime). Gated by `script/ci/github-8b.test.js`.  
   - **`natural` log4js patch — done, and no fork was needed.** [builtbygio/spell-check#5](https://github.com/builtbygio/spell-check/pull/5) merged, `@builtbygio/spell-check@0.77.6` published, pin bumped, `patches/natural@0.4.0.patch` deleted. The plan was to publish `@builtbygio/natural` with the fix folded in; the actual finding is that **spell-check declared `natural` and never used it** — across all 33 files the string appears only in `package.json`. Dropping the unused dependency retires the patch outright and takes `natural@0.4.0`, `log4js@6.9.1`, `apparatus` and `sylvester` out of the app graph. `spelling-manager` is unaffected: it uses `natural@^0.6.3`, which dropped `log4js` upstream and never needed the patch. Guarded by `script/ci/patch-inventory.test.js`.  
   - **Landed here:** deleted five patch files that pnpm never applied (their fixes shipped inside the owned forks during N2) and added `script/ci/patch-inventory.test.js` so `patches/` and `patchedDependencies` cannot drift again.  

   ✅ **Fork drift: fully reconciled — 0 of 83 mismatched.** Work used to be published from a throwaway clone and never pushed back, so a "pin source" repo described less than what shipped and publishing from it silently reverted the gap. An audit found **29 of 83**; all are now reconciled to their published tarball, each proven by packing to exactly the published file set.  
   ⚠️ **A higher repo version did not mean "further ahead".** `fs-admin` (0.20.0 vs pinned 0.15.0), `git-utils` (5.7.3 vs 5.7.1) and `node-keytar` (7.9.0 vs 4.13.0) reported *ahead* while being **pristine upstream Atom** — zero Chevron references, HEAD on Atom's `add sunset message` — and their published packages carried the context-aware native registration Electron needs. Publishing from any of them would have shipped an unmodified upstream native. Their versions were reconciled **downwards**; the upstream history is still in git if anyone wants to adopt it deliberately.  
   Run **`node script/audit-fork-drift.js`** before publishing any fork, and diff against the published tarball rather than trusting the version number.  
   Reconciling deliberately does **not** touch repo infrastructure (`.github/`, CI config, `.gitignore`): the old tarballs carry stale pre-Chevron copies that would otherwise delete a repo's current workflow.  
   **Publishing a fork:** the repo keeps the **unscoped** name (`github`, `season`); set `name` to `@builtbygio/<id>` in a throwaway clone, then `npm publish --access public --ignore-scripts`. `tree-view` also carries `private: true` (a deliberate guard — the unscoped name belongs to someone else on npm), so clear that too.  
   **Always diff `npm pack --dry-run` against the previous tarball first.** Every fork touched so far lacked an `.npmignore`, so npm fell back to `.gitignore` and a plain publish would have shipped the `test/` or `spec/` tree that the previous tarball excluded via an unrecorded manual step. Fixed in `github`, `spell-check`, `image-view`, `snippets`, `tree-view`; assume the rest still have it.  
3. **Wave 3 — done. One of four passed the gate.** Evidence recorded in `script/ci/wave3-gates.test.js` so this is not re-derived:  
   - **`Task` — DELETED.** Zero callers: nothing in `src/` but the export itself, and a sweep of all 94 owned pins found only `github/lib/async-queue.js`, which declares its *own* local `class Task` with no requires. Gone: `src/task.ts`, `src/task-bootstrap.js`, the export, `spec/task-spec.js` + fixtures. Gate: `script/ci/task-callers.test.js`.  
   - **`season` — STAYS.** Not blocked on pins (Wave 1 proved zero `.cson` across the catalog *and* the app tree). Blocked on user-authored `~/.chevron/*.cson` dual-read and any installed package's data (`config-file`, `user-config-path`, `keymap-extensions`, `package`, `grammar-registry`).  
   - **`document-register-element` — STAYS.** `document.createElement('atom-*')` under `contextIsolation`; already locked by `baseline-1.1.0` and `custom-element-factory`.  
   - **`atom://` — STAYS at Wave 3, DELETED in Wave 4.** The blocker was `image-view/styles/image-view.less` shipping a live `atom://image-view/images/transparent-background.png`. Wave 4 converted that pin and removed the alias.  
   - **Bug fixed on the way:** `handleLinkClick` rewrote canonical `chevron://` links *to* `atom://` before calling `uriHandlerRegistry.handleURI`, so correct links tripped the registry's "atom:// is a deprecated alias" warning. It now passes the scheme through; only `atom://` warns.  
4. **Wave 4 — done. `atom://` is gone.** `@builtbygio/image-view@0.64.3` emits `chevron://`, clearing the last shipped emitter across all 94 pins; then the alias came out of core: the opener fallback (`alternateSchemeURI`), `atom-paths` normalization, the `atom:` branch and deprecation warning in `URIHandlerRegistry`, the `atom` scheme in `AtomProtocolHandler` / `atom-protocol-path`, the CLI URL check, the OS protocol registration, and the macOS `CFBundleURLSchemes` entry. **`chevron://` is now the only product URI scheme.**  
   - The app was emitting `atom://` **itself** — `atom://about`, `atom://config` and five `atom://.atom/*` menu URIs in `atom-application.js`. Converted; missing them would have broken About and Settings.  
   - `script/ci/no-atom-uri.test.js` only scanned `lib/` and `src/`, which is why it never saw image-view's `styles/`. It now walks the whole package.  
   - The `.atom` **host** spelling is gone too: `packages/welcome` and `@builtbygio/snippets@1.5.6` emit/match `chevron://.chevron/*`, so core's normalization was deleted.  
   - **Regression caught while doing that:** moving the menu URI to `chevron://.chevron/snippets` broke *Open Your Snippets*. Core's default opener has no snippets case (it is the package's job) and snippets matched only `chevron://.atom/snippets` — the deleted `atom://` fallback had been bridging them silently. Fixed in snippets 1.5.6 and gated by `script/ci/menu-uri-openers.test.js`, which holds an explicit menu-URI → owner table.  
   - A stale OS association is now **withdrawn**, not ignored: `removeAsDefaultProtocolClient('atom')` runs before registering `chevron`. And an `atom://` argv entry is dropped with a diagnostic instead of falling through to `pathsToOpen`, which would have opened a file literally named `atom://…`.  
   - Gates: `script/ci/uri-scheme.test.js`, `script/ci/no-atom-uri.test.js`, `script/ci/menu-uri-openers.test.js`. `uri-scheme-alias.test.js` deleted with the helper it tested.  

5. **Do not delete** `season` / `document-register-element` / first-mate while callers remain (`Task` cleared its gate in Wave 3). **Q1 is 8B** — keep the github inbox; skip Epic 18 / PR 19. `github` **0.37.12**: React 18.3; GitHub App device-flow (`github.oauthClientId`); classic PAT fallback.  
6. Residual `@atom/*` **dependency keys** (`@atom/watcher`, `@atom/nsfw`, `@atom/fuzzy-native`) — published as `@builtbygio/*`; renaming the editor key is branding, not a drive-by.  
7. **Startup perf** — custom V8 snapshot on Linux/Windows with **stock fallback** if verify fails; Darwin stock **frozen** (Q2).  
8. **Later:** package host v2 **routing on** (spine is off); signing. Jasmine nightly is measurement, not a merge gate ([docs/reference/jasmine-ci.md](docs/reference/jasmine-ci.md)).  
9. **Build:** `./script/bootstrap-modern` then `./script/with-modern-env ./script/build --no-bootstrap`. `pnpm install` alone leaves Electron natives unbuilt.

### Known dogfood leftovers (found 2026-08-13)

- **Fixed in #108:** empty tree-view — `collectDefaultRoots` used `atomApplication.windows` (never set); must use `getAllWindows()`. `/tmp` projects hid this. Keep `document-register-element` (contextIsolation); do not Grim-wrap `registerElement`.  
- Jasmine harness still defines `window.atom` for ~7500 spec references. Product `require('atom')` is `MODULE_NOT_FOUND`.

**Dev policy env:**  
- `CHEVRON_AUDIT_PACKAGE_REQUIRES=1` — log privileged + native requires  
- `CHEVRON_RESTRICT_PACKAGE_REQUIRES=0` — opt **out** of community privileged/native restrict (default is on)  
- `CHEVRON_FS_IPC_STRICT=0` — opt out of strict FS IPC roots  
- `CHEVRON_EXPERIMENTAL_WEB_FEATURES=1` — re-enable experimental Chromium features  
- `CHEVRON_DISABLE_LEGACY_TRANSPILE=1` — unused (Coffee/Babel compile-cache stubs deleted)


### Optional hygiene

- Linux arm64: bootstrap/build are hard gates; **smoke only** is soft-gated (`continue-on-error` on smoke step)  
- Custom V8 snapshot on Linux/Windows; Darwin stock **frozen** (`darwin-boot-crash`, Q2)
- Keep `GROK.md` / CHANGELOG current when landing epics  
- Nested `packages/*/node_modules`: untracked; policy in `docs/decisions/nested-package-modules.md`  
- CI: Electron + node-gyp cache at `$GITHUB_WORKSPACE/.cache/*`; `node_modules` cache enables bootstrap **native rebuild skip** (`script/lib/natives-fingerprint.js`); force with `CHEVRON_FORCE_NATIVE_REBUILD=1`  

### Later (not next)

- Full Avalonia spike  
- In-app AI  
- Aggressive rename of `atom` JS API  

### Explicitly out of scope unless asked

- Pulsar rebase  
- Hard-delete of the remaining Atom shims (`season`, `document-register-element`) — each failed its Wave 3 gate with a named caller; see `script/ci/wave3-gates.test.js`. (`atom://` cleared its gate in Wave 4 and is gone.)  

---

## How to resume quickly

```bash
cd /path/to/chevron
git status
# Host: Node 24 + Python 3.12 (+ setuptools)
./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap

# macOS: open out/Chevron.app
# Linux packages: build with --create-debian-package --create-rpm-package --compress-artifacts
# Smoke: node script/ci/smoke-test.js   # or xvfb-run -a on Linux
```

**Docs are sorted by purpose** — `docs/orientation/` (how to work on it), `docs/reference/`
(**how it works now — must be true**), `docs/decisions/` (why, read before undoing), `docs/process/`
(finished work, not current state). Index: [docs/README.md](docs/README.md).

**Read first:**

1. This file  
2. `docs/reference/chevron-architecture-modernization.md` (**architecture target** + H1–H3 PR plan)  
3. `docs/reference/atom-architecture.md` (current-state sketch; defers to the target)  
4. `docs/process/security-phase-s.md` (active) + `src/preload-natives.js`  
5. `docs/process/electron-best-practices-plan.md` (closed)  
6. `docs/reference/security-threat-model.md`  
7. `src/main-process/register-renderer-ipc.js` (trust boundary)  

---

## Known landmines

| Landmine | Mitigation |
|----------|------------|
| Host Node outside 20–24 | `.nvmrc` → **24** |
| Python without distutils | **3.12** + setuptools (CI pin) |
| Dead atom.io Electron headers | `ATOM_ELECTRON_URL=https://www.electronjs.org/headers` |
| Snapshot without less prebuild | Full `script/build` only |
| Non-context-aware natives | Folded into owned `builtbygio` native forks; bootstrap rebuilds for Electron |
| Probing `atom` from CDP | Eval in **Electron Isolated Context**, not page world |
| Nested superstring without `.node` | Re-sync nested natives after rebuild. Force-copy **excludes** `build/` and is skipped on warm cache. |
| GitHub workers | **utilityProcess only**. Node BrowserWindow workers are gone. |
| Packaged github `renderer.html` | Unpack `github/lib/**` in `package-application.js` |
| Custom mksnapshot on E43 | Linux/Windows custom; Darwin stock **frozen** (`darwin-boot-crash`, Q2) |
| Windows ASAR integrity fuse | Leave off — FATAL without packager-embedded resources |
| FS IPC `atomApplication.windows` | Never set — use `getAllWindows()` (#108) |
| Skip `document-register-element` | Breaks `document.createElement('atom-*')` under contextIsolation |
| Tree-view tests only under `/tmp` | Temp is always an FS IPC root; real folders can still be blocked |

---

## Success criteria (rolling)

- [x] Current Electron stable  
- [x] No `@electron/remote` in production  
- [x] `contextIsolation` + preload boot  
- [x] No metrics / atom.io auto-update by default  
- [x] Multi-platform CI (macOS, Linux, Windows)  
- [x] cpm Phases 0–4 + Pulsar settings  
- [x] Phase N + Electron BP shippable defaults (protocol/IPC/CSP/require/FS/fuses)  
- [x] Phase S complete under Option C (editor sandbox false intentional; utilityProcess git workers)  
- [ ] Package migration notes for community authors (Node not guaranteed long-term)  


---

*Handoff file — update when an epic lands so the next session does not re-derive history.*
