# GROK.md — Chevron session handoff

Context for the next Grok (or human) session. Prefer this file + CHANGELOG over archaeology.

**Repo:** `builtbygio/chevron` (local: workspace `chevron`)  
**Product:** **Chevron** — modernized Atom fork  
**Date of this handoff:** 2026-10-01 (master **1.4.x**, last tag **v1.2.0**; auto-update, Wayland and the universal macOS bundle landed; the nightly Jasmine core specs pass locally)

---

## Product vision

| Horizon | Goal |
|---------|------|
| **Near term** | Nightly Jasmine green (core render done, package specs next); tag the next preview; signing secrets |
| **Medium term** | Git polish, optional AI |
| **Long term** | Possible Avalonia rehost; keep hackable package spirit |

**Do not** rebase onto Pulsar unless the owner revisits that decision.  
**Chevron only:** product API is `global.chevron` / `require('chevron')` / `engines.chevron` / `~/.chevron`. Atom surfaces are unsupported legacy shims (may be removed). See [docs/decisions/REBRANDING.md](docs/decisions/REBRANDING.md).  
**Packages:** **owned catalog only**. Community packages are cancelled (owner, 2026-08-28), not deferred. See [docs/decisions/package-ecosystem-strategy.md](docs/decisions/package-ecosystem-strategy.md).

---

## Current baseline (master 1.4.x; last tag v1.2.0)

| Item | Value |
|------|--------|
| Version | **1.4.x** on master — a patch bump per fix, all under `[Unreleased]` in CHANGELOG; tagging is separate. Last published: **v1.2.0** unsigned preview ([docs/reference/releases.md](docs/reference/releases.md)) |
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
| Registry | **None** — the registry client and install UI went in #239; cpm installs an owned package from a directory or links a working copy |
| Bootstrap | **pnpm workspaces** + `@electron/rebuild` via `./script/bootstrap-modern` |
| CI | macOS x64/arm64 + universal merge, Linux x64/arm64 (packages + smoke), Windows x64. Nightly Jasmine in 7 shards — measurement, not a gate |
| Catalog | **93** packages in `packages/`, 86 of them app dependencies as `workspace:@builtbygio/<id>@*`. **13** owned libs/natives stay `npm:@builtbygio/<id>@ver`. **0** git SHA pins |
| Default themes | **One Dark** (`one-dark-ui` / `one-dark-syntax`). Eight themes ship: One Dark/Light + Chevron Dark/Light, UI + syntax each. Solarized and base16-tomorrow were dropped; `ThemeManager` maps their names onto the survivors. Theme variables reach package styles as CSS custom properties generated at build ([theme-custom-properties.md](docs/reference/theme-custom-properties.md)); `core.followSystemTheme` swaps light/dark with the OS |
| Package host v2 | **Removed** (2026-08-28) — community packages are cancelled, so sandboxing third-party code has no subject. T2 require restrict stays |
| Auto-update | electron-updater on GitHub Releases (#398). Signing and notarization run when the secrets exist — they don't yet, so unsigned builds open the download page. [auto-update.md](docs/reference/auto-update.md) |
| Linux display | Native Wayland (`--ozone-platform-hint=auto`); CI pins x11 for Xvfb. [os-integration.md](docs/reference/os-integration.md) |
| macOS artifact | One universal `chevron-mac-universal.zip`, merged with `lipo` in CI. [packaging.md](docs/reference/packaging.md) |

---

## What's done (recent epics)

### Since 1.2.0 (2026-09-06 → 2026-10-01)

- **Features (#396, #398):** native Wayland, follow-system theme, universal macOS bundle, auto-update through GitHub Releases with signing/notarization wiring.
- **Editor fixes:** the custom elements polyfill is `@webcomponents/custom-elements` (#384); grammarless buffers fold and auto-indent, and `.text.plain.null-grammar` config applies (#385, #400); LSP hover renders markdown (#387); scroll-to-row rounding, cursor blink delay, middle-click paste (#391, #393, #394).
- **Nightly Jasmine catch-up (#400–#403).** The suite had never passed: specs still loaded `season`, `first-mate`, `.cson` grammars and `require('atom')`. Fixing them surfaced real bugs — auto-indent broken in ten languages (Oniguruma-only patterns, now rewritten by `fromOniguruma()` in `src/auto-indent.ts`), syntax lookups at a cursor returning nothing (bracket-matcher's spec went 124 → 2 failures), HTML in JS template literals and JSDoc comments unhighlighted, JSX self-closing folds. Core render specs pass locally except `text-editor-element` / `text-editor-component` (timing; CI-only). **Package specs are next.** The tree-sitter 0.25 traps are listed in [language-stack.md](docs/reference/language-stack.md).

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

Tag `v1.2.0` (after `v1.1.0`). Docs: [docs/reference/releases.md](docs/reference/releases.md), [docs/process/dogfood-1.0.md](docs/process/dogfood-1.0.md).  
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

### TextMate retirement — **complete** (2026-09-04)

**One highlighter.** first-mate, oniguruma and every TextMate grammar are deleted (#311–#320): 69 TextMate grammars across 32 packages → **0**, catalog 34 → 27 language packages, ~54k lines removed. `season` and `cson-parser` left the tree with first-mate, which was their only requirer.

Ported on the way: **markdown** (block + inline injection; fenced code injects the language named in the fence, which needed `injectionRegExp` on 22 grammars), **make**, **objective-c**, **XML plists**. ~90 file types moved onto tree-sitter grammars (`cjs`, `mjs`, `PKGBUILD`, `Fastfile`, `Snakefile`, `htm`, `xhtml`, `hbs`, `csx`, `mm`, `xsl`, …).

**Nineteen scopes lost highlighting**, and no parser exists on npm for any of them: plain text, sass, the git buffers, `go.mod`/`go.sum`, java properties/jsp/el, perl6, objc strings, the rails overlays. They open, edit and search; they are not coloured. Also dropped: hyperlink (URLs in comments are no longer scoped, so **Open Link does not fire there**), todo, coffee-script, mustache (`.hbs` opens on the HTML grammar).

Auto-indent moved off the deleted mode to `src/auto-indent.ts`, and off oniguruma onto `new RegExp`. Three things broke on the way, all of them code assuming every editor has a TextMate mode — bracket-matcher's `tokenizedLineForRow` and its `ScopeSelector`, and `TextEditor#getRootScopeDescriptor`, which `NullLanguageMode` has no answer for. **Only the packaged smoke test caught two of them**; every unit gate was green.

The decision reversed three times and all three are recorded. [language-stack.md](docs/reference/language-stack.md) §3 is the live reference; [textmate-retirement-plan.md](docs/process/textmate-retirement-plan.md) has the sequencing and what each step cost.

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
   - **`season` — stayed at Wave 3, deleted 2026-09-02 (#295).** Chevron reads JSON only; `src/main-process/json-file.js` replaced it, and `atom-keymap` was vendored as `src/keymap/` (#284) so it no longer pulled it in.  
   - **A custom elements polyfill — STAYS.** `window.customElements` is null in the preload world under `contextIsolation`; `@webcomponents/custom-elements` since 2026-09-07 (was `document-register-element`). Locked by `baseline-1.1.0` and `custom-element-factory`; see `docs/reference/custom-elements.md`.  
   - **`atom://` — STAYS at Wave 3, DELETED in Wave 4.** The blocker was `image-view/styles/image-view.less` shipping a live `atom://image-view/images/transparent-background.png`. Wave 4 converted that pin and removed the alias.  
   - **Bug fixed on the way:** `handleLinkClick` rewrote canonical `chevron://` links *to* `atom://` before calling `uriHandlerRegistry.handleURI`, so correct links tripped the registry's "atom:// is a deprecated alias" warning. It now passes the scheme through; only `atom://` warns.  
4. **Wave 4 — done. `atom://` is gone.** `@builtbygio/image-view@0.64.3` emits `chevron://`, clearing the last shipped emitter across all 94 pins; then the alias came out of core: the opener fallback (`alternateSchemeURI`), `atom-paths` normalization, the `atom:` branch and deprecation warning in `URIHandlerRegistry`, the `atom` scheme in `AtomProtocolHandler` / `atom-protocol-path`, the CLI URL check, the OS protocol registration, and the macOS `CFBundleURLSchemes` entry. **`chevron://` is now the only product URI scheme.**  
   - The app was emitting `atom://` **itself** — `atom://about`, `atom://config` and five `atom://.atom/*` menu URIs in `atom-application.js`. Converted; missing them would have broken About and Settings.  
   - `script/ci/no-atom-uri.test.js` only scanned `lib/` and `src/`, which is why it never saw image-view's `styles/`. It now walks the whole package.  
   - The `.atom` **host** spelling is gone too: `packages/welcome` and `@builtbygio/snippets@1.5.6` emit/match `chevron://.chevron/*`, so core's normalization was deleted.  
   - **Regression caught while doing that:** moving the menu URI to `chevron://.chevron/snippets` broke *Open Your Snippets*. Core's default opener has no snippets case (it is the package's job) and snippets matched only `chevron://.atom/snippets` — the deleted `atom://` fallback had been bridging them silently. Fixed in snippets 1.5.6 and gated by `script/ci/menu-uri-openers.test.js`, which holds an explicit menu-URI → owner table.  
   - A stale OS association is now **withdrawn**, not ignored: `removeAsDefaultProtocolClient('atom')` runs before registering `chevron`. And an `atom://` argv entry is dropped with a diagnostic instead of falling through to `pathsToOpen`, which would have opened a file literally named `atom://…`.  
   - Gates: `script/ci/uri-scheme.test.js`, `script/ci/no-atom-uri.test.js`, `script/ci/menu-uri-openers.test.js`. `uri-scheme-alias.test.js` deleted with the helper it tested.  

5. **Do not delete the custom elements polyfill** — `window.customElements` is null in the preload world (`document-register-element` itself was replaced in #384). **Q1 is 8B** — keep the github inbox; skip Epic 18 / PR 19. `github` **0.37.12**: React 18.3; GitHub App device-flow (`github.oauthClientId`); classic PAT fallback.  
6. Residual `@atom/*` **dependency keys** (`@atom/watcher`, `@atom/nsfw`, `@atom/fuzzy-native`) — published as `@builtbygio/*`; renaming the editor key is branding, not a drive-by.  
7. **Startup perf** — custom V8 snapshot on Linux/Windows with **stock fallback** if verify fails; Darwin stock **frozen** (Q2).  
8. **Later:** signing secrets — the pipeline is ready (#398). Jasmine nightly is measurement, not a merge gate ([docs/reference/jasmine-ci.md](docs/reference/jasmine-ci.md)).  
9. **Build:** `./script/bootstrap-modern` then `./script/with-modern-env ./script/build --no-bootstrap`. `pnpm install` alone leaves Electron natives unbuilt.

### Known dogfood leftovers (found 2026-08-13)

- **Fixed in #108:** empty tree-view — `collectDefaultRoots` used `atomApplication.windows` (never set); must use `getAllWindows()`. `/tmp` projects hid this. Keep the custom elements polyfill (contextIsolation); do not Grim-wrap `registerElement`.  
- Jasmine harness still defines `window.atom` for ~7500 spec references. Product `require('atom')` is `MODULE_NOT_FOUND`.

**Catalog is vendored** (2026-08-28): all 94 editor packages live in `packages/` as
`workspace:@builtbygio/<id>@*`. There is no publish step and no pin to drift. The owned
libs/natives (`text-buffer`, `keytar`, `superstring`, …) stay npm pins — they are real libraries with
native builds. `first-mate` and `oniguruma` are no longer among them. The 30 `builtbygio/*` package repos are now dead; archive them.

**Community packages: never** (owner, 2026-08-28). Not deferred — cancelled. See
`docs/decisions/package-ecosystem-strategy.md`. Done since: the catalog collapsed into `packages/*`,
the host v2 spine (#238) and the registry client (#239) are gone, and four of the eight
author-facing devtools (`dalek`, `incompatible-packages`, `package-generator`,
`update-package-dependencies`). Still shipping: `deprecation-cop`, `timecop`, `styleguide`,
`dev-live-reload`.

**Retired, do not resurrect:** the `apm/` tree and `--with-apm` (the installer it called was already
deleted); `script/vsts/` Azure pipelines; the in-app **benchmarks** feature (`--benchmark`,
`window:run-benchmarks`) — wired up but never run by anything, and startup perf uses a different
harness; `Task`; the `atom://` scheme and `.atom` host. `dot-atom/` is now `dot-chevron/`. Windows
Squirrel no longer writes `apm.*` shims — an install upgraded from an older build keeps a stale
`apm.cmd`, which pointed at a missing target then too.

**Dev policy env:**  
- `CHEVRON_AUDIT_PACKAGE_REQUIRES=1` — log privileged + native requires  
- `CHEVRON_RESTRICT_PACKAGE_REQUIRES=0` — opt **out** of community privileged/native restrict (default is on)  
- `CHEVRON_FS_IPC_STRICT=0` — opt out of strict FS IPC roots  
- `CHEVRON_EXPERIMENTAL_WEB_FEATURES=1` — re-enable experimental Chromium features


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
- Removing the custom elements polyfill — see `script/ci/wave3-gates.test.js`. (`atom://` cleared its gate in Wave 4 and is gone; `season` and first-mate are gone too.)  

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
| Snapshot without less prebuild | Full `script/build` only |
| Non-context-aware natives | Folded into owned `builtbygio` native forks; bootstrap rebuilds for Electron |
| Probing `atom` from CDP | Eval in **Electron Isolated Context**, not page world |
| Nested superstring without `.node` | Re-sync nested natives after rebuild. Force-copy **excludes** `build/` and is skipped on warm cache. |
| GitHub workers | **utilityProcess only**. Node BrowserWindow workers are gone. |
| Packaged github `renderer.html` | Unpack `github/lib/**` in `package-application.js` |
| Custom mksnapshot on E43 | Linux/Windows custom; Darwin stock **frozen** (`darwin-boot-crash`, Q2) |
| Windows ASAR integrity fuse | Leave off — FATAL without packager-embedded resources |
| FS IPC `atomApplication.windows` | Never set — use `getAllWindows()` (#108) |
| Skip the custom elements polyfill | `window.customElements` is null in the preload world under contextIsolation |
| Tree-view tests only under `/tmp` | Temp is always an FS IPC root; real folders can still be blocked |
| Language-settings regexes | Written for Oniguruma; one JavaScript rejects is dropped silently. `fromOniguruma()` handles `(?x)` and possessives; `spec/auto-indent-spec.js` compiles them all |
| Atom-era tree-sitter assumptions | Official 0.25 differs (inverted ranges → `null`, roots start at the first token, string text is a node). [language-stack.md](docs/reference/language-stack.md) lists them |
| Fake clock in specs | underscore 1.13 binds its clock at load; `spec-helper` reroutes `debounce`/`throttle`. Don't add another clock library without the same treatment |

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
- [x] Auto-update via GitHub Releases  
- [ ] Nightly Jasmine green (core render done; package specs next)  
- [ ] Signed release builds (secrets)  


---

*Handoff file — update when an epic lands so the next session does not re-derive history.*
