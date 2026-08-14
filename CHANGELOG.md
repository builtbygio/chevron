# Changelog

All notable changes to **Chevron** are documented in this file.

Chevron is a modernised fork of [Atom](https://github.com/atom/atom). Historical Atom releases are archived at the upstream project; this log covers Chevron only.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Own remaining unowned core loaders as `builtbygio` git pins: `first-mate@7.4.3`, `atom-keymap@8.2.15`, `atom-select-list@0.8.1`, `season@6.0.2`, `scandal@3.2.0`, `text-buffer@13.18.6`, `fs-admin@0.15.0`, `scrollbar-style@4.0.1`. Each ships compiled `lib/` from the npm tarball (several Atom git tags were Coffee-only or missing the published version). `prepare`/`prepublish` that `rimraf lib/` are no-ops. Overrides hoist nested copies (including text-buffer’s `fs-admin@0.19` and owned-package `atom-select-list@0.7.2`) to the same SHAs.
- Bootstrap force-copy of monorepo superstring/watcher no longer includes `packages/*/build/` and only runs when natives are actually rebuilt, so a warm cache cannot ship a host-Node `.node`. `link-package-natives-to-root` no longer copies `tree-sitter`.
- `./script/build` without `--no-bootstrap` no longer calls the dead `script/bootstrap` stub. A bootstrapped tree packages; a cold tree prints the `bootstrap-modern` commands.
- Own the remaining 22 TextMate-only `language-*` packages (`#79`). No `atom/*` app git pins left.
- Pre-transpile `builtbygio/github` `lib/` to CJS and drop `atomTranspilers`. Packaging no longer runs a host Babel 7 install inside that package.
- Custom V8 snapshot stays **stock on Darwin**. CI #125 generated a valid pair on both Mac archs then the process died at smoke (`app exited during startup`). Linux/Windows keep the custom snapshot. `CHEVRON_FORCE_MKSNAPSHOT=1` still retries.
- Mac arm64 bootstrap: `ensure-ripgrep` was dying on an unauthenticated GitHub API 403 (`microsoft/ripgrep-prebuilt` v12.1.1). Pass `GITHUB_TOKEN`, `--force` when `bin/rg` is missing, and fall back to the release asset URL.
- Jasmine (#57) first nightly: every renderer spec crashed on `jasmine-node` `failure-tree.coffee` (#62). Ship a compiled stand-in. `AtomWindow` tests no longer require `resourcePath` / `Atom` in the window title.

### Fixed

- `.c` (and other official tree-sitter languages) had no colour: `loadLanguageModule` stripped `{ name, language, nodeTypeInfo }` down to the raw Language, so tree-sitter 0.25 could not build node classes. Keep the full module. Also stop deferring `language-*` so grammars exist before the first editor. Reject an unusable parser so the TextMate grammar can still win.
- Incremental tree-sitter highlight after edits: official `hasChanges` is a boolean getter, not DeeDeeG's `hasChanges()`.
- `bootstrap-modern` no longer overwrites npm `tree-sitter@0.25` with a vendored DeeDeeG 0.17 / ABI 12 tree. That is why local builds kept an old runtime after #113.
- Deleted unused `packages/tree-sitter` (DeeDeeG 0.17). Runtime is npm `tree-sitter@0.25.1` plus official `tree-sitter-*` N-API prebuilds.
- Deleted `patch-tree-view-stats.js` (already in builtbygio/tree-view). Stopped rewriting official grammar addons and owned superstring/watcher sources that already have the V8 / context-aware fixes.
- Forked remaining compile-patched natives to `builtbygio` and folded the Electron 43 / V8 15 fixes into those sources. Deleted `patch-natives-context-aware`, `patch-v8-api`, `patch-oniguruma-gyp`, `patch-spellchecker-win`, and `patch-keytar-nan`.
- Deleted no-op / unused bootstrap patches: `patch-nested-nan`, `patch-github-remote`, `patch-settings-view-registry`, `patch-apm-npm`, `patch-apm-download-node`.
- Owned `atom-pathspec` (IPC `getPath`) and `isbinaryfile@2` (`main: index.js`). Deleted `patch-packages-remote-ipc` and `patch-dep-package-json`. Root `isbinaryfile@3` is unchanged.
- Owned `nslog` / `ctags` now ship the compiled `lib/*.js` from the npm tarball (`package.json` `main`). The git tags only had Coffee sources, so the packaged app failed to `require` them.
- Settings install/uninstall: accept apm's `install --json`, `install --check`, and `uninstall --hard` so commander 12 does not reject the settings-view argv.
- Find-in-project: download `vscode-ripgrep`'s `rg` during bootstrap/package (skipped by `--ignore-scripts`) so packaged `app.asar.unpacked` has the binary.
- Settings installed/outdated lists: `cpm ls --json` emits the apm `{ user, core, dev, git }` shape; `cpm outdated --json` exits 0 with `[]`.

### Changed

- Newly owned natives (`nslog`, `ctags`, `nsfw`, `atom-pathspec`, `isbinaryfile@2`, and the other builtbygio native pins) keep the APIs Chevron actually calls: nslog is still a function, ctags still has 3-arg `findTags` + `createReadStream`, oniguruma still exports `OnigRegExp`/`OnigScanner`, nsfw still uses actions 0–3, isbinaryfile stays the 2.x buffer API. Coffee/grunt/Atom CI dropped; keytar no longer pulls `prebuild-install`.
- Startup harness waits for `window:setup-window:end` (workspace ready) and graceful-quits so the V8 compile cache can persist. Linux x64 1.0.1 baseline: ~2.1 s cold / ~2.0 s warm; cache writes but only saves ~6%. See [docs/startup-snapshot-plan.md](docs/startup-snapshot-plan.md).
- Defer heavy bundled packages (`github`, `markdown-preview`, `settings-view`, autocomplete, `language-*`, …) until after first paint. Linux `setup-window:end` **1582 → 1103 ms**. Skip the untitled editor when Welcome will auto-open.
- Restore the custom V8 startup snapshot on Electron 43: evaluate modules at snapshot time, construct `AtomEnvironment` at runtime. Linux require interval **327 → 11 ms**; workspace-ready is unchanged on a fast host because construction still runs at runtime. `electron-mksnapshot` is driven so the context generator sees the custom isolate blob, not Electron's stock one. `CHEVRON_SKIP_MKSNAPSHOT=1` keeps the stock path.

## [1.0.1] — 2026-08-13

**Unsigned preview.** Same 1.0 contract as 1.0.0: owned catalog, Phase S Option C, GitHub Releases. Installers: [v1.0.1](https://github.com/builtbygio/chevron/releases/tag/v1.0.1). See [docs/releases.md](docs/releases.md).

### Added

- Linux **Jasmine** nightly + manual workflow (`jasmine.yml`) and opt-in on the main CI (dispatch `run_full_core_tests` or PR label `jasmine`). Not a required PR gate. `script/test` finds `Chevron-linux-<arch>/chevron`. See [docs/jasmine-ci.md](docs/jasmine-ci.md) (#57).

### Changed

- Official **tree-sitter 0.25.1** (N-API) replaces `file:packages/tree-sitter` (DeeDeeG / ABI 12). Tree-sitter-backed `language-*` are now **builtbygio** pins with current `tree-sitter-*` grammars (ABI 13–15). `parseTextBuffer` → `parse(buffer.getText())`. TextMate-only `language-*` stay on `atom/*` (#79).
- ESM official grammars (`tree-sitter-css@0.25` is `"type": "module"`) load through `node-gyp-build` instead of sync `require()`. Packaging keeps only host-arch `prebuilds/`; RPM `brp-strip` is undefined so leftover `.node` files cannot fail the package.
- Pin `tree-sitter-css` **0.23.2** (CJS) so packaged macOS/Windows can `require()` the grammar; 0.25.0 is ESM + top-level await.
- Owned tree-sitter `language-*` (and in-repo `language-rust-bundled`) no longer ship CoffeeScript: grammars/settings/snippets are JSON; injection mains and specs are TypeScript.
- Owned catalog modernization pass (32 `builtbygio/*` product packages): remaining CoffeeScript/CSON dropped (JSON keymaps/menus; TypeScript specs/mains), `engines.chevron` on every fork, coffeelint removed.
- Owned product `lib/` / `src/` use `require('chevron')`. The `require('atom')` host shim stays for community packages and specs.
- **tree-view** leftover `lib/*.js` is TypeScript (`fs-via-main` included).

### Security

- Dependabot lockfile hygiene: npm `overrides` pin patched same-major releases (`minimatch` 3.1.4, `brace-expansion` 1.1.18, `js-yaml` 3.15.1, `lodash` 4.18.x, `form-data` 2.5.6, `tar` 6.2.1 / 7.5.21, `postcss` 8.5.23, and similar) on the root, `script/`, `apm/`, nested package, and leftover VSTS/update-server lockfiles. Direct bumps: `minimatch` 3.1.4, `postcss` 8.5.23, script `semver` 5.7.2 / `simple-git` 3.x, update-server `express` 4.21. Unpatched: residual `request`/`hawk`, mocha/growl.
- **archive-view** lists/reads archives through [builtbygio/ls-archive](https://github.com/builtbygio/ls-archive) (`list`/`readFile` unchanged). **tar 7** `Parser` replaces `ls-archive@1.3.4` / `tar@2` `Parse()`. Zip still uses `yauzl`; `.tar.bz2` still uses `unbzip2-stream`.
- Autocomplete update/doc-fetch scripts (`autocomplete-chevron-api`, `autocomplete-css`, `autocomplete-html`) use `fetch` instead of the deprecated `request` package.
- **settings-view** `atom-io-client` uses `fetch` for Pulsar registry + GitHub avatars; the runtime `request` dependency is gone.
- Code scanning: CI `permissions: contents: read`; skip `__proto__` in `Config.deepDefaults`; Windows `BufferedProcess` quoting escapes backslashes and ignores `COMSPEC`; tooltip HTML goes through DOMPurify (attribute titles stay text); lockfile git URL rewrite only matches a prefix; local Squirrel test server confines `sendFile` and rate-limits.

### Fixed

- Welcome / Guide **Open a Project** uses `application:add-project-folder` (Linux/Windows `application:open` mixed file+folder dialogs often cancel immediately). Off-macOS `promptForPath('all')` is a folder picker with dialog errors logged.
- Opening a project folder now updates FS IPC allowed roots **before** tree-view `lstat`s the path. Strict `core.fsIpcStrict` was treating the new folder as missing, so the tree stayed empty.
- FS IPC `collectDefaultRoots` now uses `getAllWindows()`. It read `atomApplication.windows`, which is never set, so real project folders were blocked (empty tree). `/tmp` projects still appeared because temp is always allowed.
- Stop wrapping `document.registerElement` with Grim. The `document-register-element` polyfill must stay (contextIsolation: native `define()` does not upgrade `document.createElement('atom-*')`); its `define()` calls `registerElement`, which was a false deprecation from `styles-element.js`.
- First-party `src/text-editor-element.js` `require('chevron')` so startup no longer emits the `require("atom")` legacy warning from core.
- Deprecation Cop labels untitled Grim stacks as **chevron core**, not atom core.
- macOS `--compress-artifacts` zip is per-arch (`chevron-mac-x64.zip` / `chevron-mac-arm64.zip`) so a dual-arch GitHub Release no longer overwrites one Mac build.

## [1.0.0] — 2026-08-12

**Unsigned preview.** Modernization 1.0: owned catalog, Phase S Option C, GitHub Releases as the update URL. Binaries are **not** codesigned. See [docs/releases.md](docs/releases.md) and [docs/dogfood-1.0.md](docs/dogfood-1.0.md).

Deferred on purpose: package host v2, `language-*` forks (#79), `@electron/packager`, custom E43 snapshot, signing.

### Security

- **Phase S complete (Option C):** editor Chromium `sandbox` stays **false** by product decision ([docs/security-phase-s-decision.md](docs/security-phase-s-decision.md)). GitHub package git workers use **utilityProcess only** (Node BrowserWindow path is emergency-only via `CHEVRON_ALLOW_PACKAGE_WORKER_BROWSERWINDOW=1`). Community native/privileged require restrict and package-host design remain as shipped. S4 sendSync→invoke and package-host v2 are post–Phase S.
- **Repo audit P0–P2 hygiene** (SECURITY.md, Help URLs, inventories, unit CI, arm64 soft-gate, legacy transpile isolate, nested-modules policy) — see prior unreleased bullets in git history / closed issues #51–#67.

### Fixed

- README / CONTRIBUTING license links point at `LICENSE.md`; CONTRIBUTING workflow documents default branch `master` (not `main`).
- Win32 auto-updater `update-downloaded` release URL uses the configured feed / GitHub releases instead of `https://atom.io`.
- **Restore builtbygio package pins** after #81 accidentally rewrote several ownership URLs back to `atom/*`. Land **`autocomplete-chevron-api`** rename end-to-end (dep key, packageDependencies, require, fork `name`, decaffeinate patch). Pin-policy CI test prevents regressions.

### Added

- **Unsigned preview releases:** tag `v*` publishes multi-platform CI artifacts to GitHub Releases. Check for Update queries the Releases API and opens the download page (no silent install). Update URL: https://github.com/builtbygio/chevron/releases — [docs/releases.md](docs/releases.md).
- **LSP plan + Phases 0–5 + goal hardening:** [docs/lsp-design.md](docs/lsp-design.md). Phases 0–5 as planned; adjustments for G5 supervision (crash restart/backoff/storm/idle), G6 replaceable `lsp.diagnostics` (+ gutter/panel + stub consumer), clearer unsandboxed trust copy.

### Changed

- **Class C fold:** owned pins now ship the precompiled decaffeinate/debabel JS (`archive-view`, `autocomplete-chevron-api`, `autocomplete-css`, `bookmarks`, `keybinding-resolver`, `open-on-github`, `styleguide`, `symbols-view`, `timecop`, `wrap-guide`). Bootstrap no longer patches `node_modules` for Coffee/babel-prefix leftovers; `script/patches/decaffeinated-*` and `debabelled-*` removed.
- **Runtime SCA:** owned `markdown-preview`, `autocomplete-plus`, `github`, `notifications`, and `settings-view` pins bump **marked 4.3.0** (last CJS; call `marked.parse`) and **DOMPurify 3.4.13**. `github` sanitizes after parse (marked 1+ dropped `sanitizer`) and uses dugite **1.110.0**. Root overrides force those marked/DOMPurify versions and **tar 6.2.1** under dugite. In-repo `deprecation-cop` matches. Leftover: residual `request`/`form-data` — see [docs/sca-runtime-inventory.md](docs/sca-runtime-inventory.md).
- **SUPPORT.md** rewritten for Chevron (#75): points at README, `docs/`, CONTRIBUTING, Issues, and SECURITY.md. Dead Atom Flight Manual / atom.io API / Atom Discussions links removed.
- **Docs hygiene (#76):** first-party `docs/` point at Chevron, not the dead Flight Manual; `docs/rfcs/` marked historical. **package-node-policy.md** matches Chevron-only home and legacy `atom` aliases ([REBRANDING.md](docs/REBRANDING.md)).
- **Build modernization (Streams A–E):** A–C as before; **B** — `overrides.nan=2.28.0` (no nested keytar nan 2.14), frozen Class C patch sets; **D** — [packaging.md](docs/packaging.md), stock V8 snapshot marker, packager retained; **E** — [dependency-graph.md](docs/dependency-graph.md), `atom/*` git pin ceiling (33). See [docs/build-modernization.md](docs/build-modernization.md).
- **Chevron-only product policy:** drop dual-support commitment. Default config home is **`~/.chevron`** (no default to `~/.atom`). Prefer `engines.chevron` (cpm warns on `engines.atom` alone). `require('atom')` logs a one-shot deprecation warning. See [docs/REBRANDING.md](docs/REBRANDING.md).
- **Package ecosystem:** **owned catalog only** for the near term; open/sandboxed community packages deferred until base Chevron is ready (package host v2). See [docs/package-ecosystem-strategy.md](docs/package-ecosystem-strategy.md).
- **Atom → Chevron rename program (Phases 0–5):** Chevron-primary API — `global.chevron` / `global.chevronApplication` / `require('chevron')` with `atom` aliases; bundled themes renamed `atom-*-ui/syntax` → `chevron-*-ui/syntax` with config migrate for old names; monorepo packages prefer `require('chevron')`. Policy in [docs/REBRANDING.md](docs/REBRANDING.md) + [docs/atom-to-chevron-rename-plan.md](docs/atom-to-chevron-rename-plan.md). Deferred: `atom-keymap`, `atom-select-list`, `@atom/*`.
- **#62 Options 2–3 — drop CoffeeScript and Babel 5 runtime transpile:** remove `coffee-script` and `babel-core@5` from app dependencies. Bootstrap decaffeinates remaining Coffee `lib/` packages and applies precompiled plain JS for atom/* babel-prefix packages; owned builtbygio forks (settings-view, find-and-replace, autocomplete-plus, command-palette, tree-view) and monorepo `packages/*` are precompiled at source. Compile-cache refuses `.coffee` / babel opt-in prefixes with migration errors; cpm warns on install. TypeScript path unchanged. See [docs/babel-coffee-isolation-plan.md](docs/babel-coffee-isolation-plan.md).
- **CI speed:** split Electron binary/header cache from npm/`node_modules` cache; bootstrap skips `npm ci` and native force-rebuild when deps + natives fingerprints match (warm cache). Override with `CHEVRON_FORCE_NATIVE_REBUILD=1`.
- **npm hygiene (not silence):** keep default npm loglevel so deprecations stay visible; upgrade cpm `@electron/rebuild` / pacote / arborist; bump root `semver` / `resolve` / `postcss`.
- **prebuildify path:** drop first-party `prebuild-install` dependency; cpm prefers **`node-gyp-build`** (prebuildify model); owned `tree-sitter` / `@atom/watcher` install scripts use `node-gyp-build`; legacy `prebuild-install` only if a third-party package still ships it.
- **Dockerfile** replaced: Ubuntu 24.04 + Node 24 + Python 3.12 (no Python 2 / Atom-era bootstrap). See comments in `Dockerfile` for usage.
- Help menus: removed obsolete “Terms of Use” (atom.io product ToS); “View License” remains for in-app license text.
- Removed stale root `MIGRATION-CHECKLIST.md` (AtomNova); see [docs/REBRANDING.md](docs/REBRANDING.md).
- CI: fast `unit-and-cpm` job (`cpm` tests + `script/ci/package-require-audit.test.js`). Full Jasmine still optional / local (see CI workflow comments).
- CI Linux arm64: bootstrap/build are hard gates; only the Xvfb smoke step is soft-gated (no longer whole-job `continue-on-error`).
- Docs: [package-ownership-inventory.md](docs/package-ownership-inventory.md), [sca-runtime-inventory.md](docs/sca-runtime-inventory.md); package-node-policy classification edge cases.

## [0.6.0] — 2026-08-01

Electron best-practices hardening track complete for its terminal goals. Electron remains **43.1.0**. Phase S (editor sandbox, utilityProcess workers, wholesale `sendSync`→`invoke`) stays follow-on.

### Security

- **Electron best practices P0–P3 (shipped scope):** path-confined `atom://`/`chevron://`; package-worker-only `atom-bw-id-call-sync` + scoped `atom-wc-send`; tighter CSP; **default-on** community privileged-require restrict (`core.restrictCommunityPackageRequires`); experimental web features **off** by default; strict FS IPC roots (`core.fsIpcStrict`); guest `file:` root confinement; `nodeIntegrationInWorker: false`; `certificate-error` denied; production Electron fuses on package (ASAR integrity macOS-only); threat model doc. See [docs/electron-best-practices-plan.md](docs/electron-best-practices-plan.md) (plan **closed**).
- **Follow-on (not this release):** full `sendSync`→`invoke` ([inventory §11](docs/remote-ipc-inventory.md)), github `utilityProcess` workers, editor `sandbox: true` (Phase S — blocked on natives).

### Changed

- Session handoff (`GROK.md`) and README status updated for **0.6.0** / Phase S prep as next track.
- Electron best-practices plan marked complete; residual items sequenced under Phase S.

## [0.5.0] — 2026-07-26

Language modernization, owned-package ownership, and Security Phase N close-out for the pre–Electron best-practices hardening track. Electron remains **43.1.0**.

### Fixed

- **App icons:** regenerate channel PNGs/ICOs with true transparent corners (no white JPEG fringe); ship multi-size icons for Linux taskbar; improve `BrowserWindow` icon loading + `app.setDesktopName` for shell association
- **settings-view + cpm:** `cpm view --json` returns apm-shaped metadata with top-level `version`; supports `--compatible`; owned settings-view null-safe on failed/missing pack (no `pack.version` throw)
- **Electron 43 `isWebViewFocused` / `focusOnWebView`:** removed BrowserWindow APIs replaced with `webContents.isFocused()` / `webContents.focus()`; IPC window proxy falls back for DevTools methods
- **Build / bootstrap noise:** `@atom/fuzzy-native` GCC 15+ `<cstdint>` + `Object::Set().Check()`; skip tree-sitter-typescript placeholder `binding.gyp`; fix nested `isbinaryfile` package `main`; skip custom V8 startup snapshot on Electron ≥43 (stock snapshots; `CHEVRON_FORCE_MKSNAPSHOT=1` to retry); force-rebuild natives with modern node-gyp only

### Security

- **Phase N5.1:** package secondary BrowserWindows (github workers) — fixed hardened prefs, `chevron-package-worker` partition, file:-only navigation, deny window.open/permissions; editor remains `sandbox: false` (hackable)
- **Fold N2 bootstrap patches into owned forks:** pin `settings-view`, `tree-view`, `fuzzy-finder`, `github` to commits that include Pulsar registry, avatar-cache IPC, fs-via-main, path probes, residual-remote cleanup; bootstrap patch scripts remain idempotent guards
- **Nine owned packages audit:** `tabs` cross-window DnD without `electron.remote`; `autocomplete-plus` / `notifications` `openExternal` via applicationDelegate; `find-and-replace` symlink icon probe via main IPC; all nine set `repository` to builtbygio + `engines.chevron`
- **Owned-package CI (Option B):** package forks drop dead Atom installer CI; metadata-only checks on `tabs`/`notifications`; integration gate is Chevron monorepo bootstrap/build/smoke
- **Nine package libs → TypeScript:** mechanical conversion of `lib/` (CoffeeScript via decaffeinate + JS rename) for autocomplete-plus, command-palette, find-and-replace, markdown-preview, notifications, snippets, spell-check, status-bar, tabs; specs unchanged; package TS transpile upgraded from `typescript-simple` to TypeScript 5.7 `transpileModule`
- **TypeScript 6:** package/runtime transpile uses `typescript@6.0.3` (`transpileModule`)
- **Owned forks + CSON→JSON:** convert settings-view/tree-view off CoffeeScript; Tier-1 package keymaps/menus/snippets to JSON; monorepo keymaps/menus/grammars to JSON (user `config.cson`/`keymap.cson` still dual-supported)
- **Zero first-party CoffeeScript:** convert Chevron `src/*.coffee` → TypeScript; monorepo specs/fixtures and in-repo packages (autoflow, deprecation-cop) off CoffeeScript; nine package specs/fixtures cleared; keep optional coffee compile-cache for community packages
- **Phase N2.2–N2.4:** fuzzy-finder path probes, tree-view bulk fs via main IPC, github residual remote cleanup
- **Phase N3.1:** preload natives inventory; package Node policy; editor session permission deny-list; optional require audit
- **Phase N3.2:** opt-in `CHEVRON_RESTRICT_PACKAGE_REQUIRES=1` blocks privileged `require`s from community packages only (core/bundled exempt)
- **Phase N4.1:** guest `<webview>` WebContents — deny window.open, restrict navigation schemes, deny permissions, default `chevron-guest` partition
- **Bundled package ownership (Option B):** pin Tier-1 packages to `builtbygio` forks: `settings-view`, `tree-view`, `fuzzy-finder`, `github`, `autocomplete-plus`, `command-palette`, `find-and-replace`, `markdown-preview`, `notifications`, `snippets`, `spell-check`, `status-bar`, `tabs`
- **bootstrap:** GCC 14+ oniguruma build fix (`patch-oniguruma-gyp.js`)

### Added

- **Electron best-practices plan:** [`docs/electron-best-practices-plan.md`](docs/electron-best-practices-plan.md) — P0 protocol/IPC allowlists through Phase S (next track after 0.5.0)

## [0.4.0] — 2026-07-22

Package manager cutover and Security Phase N resume. Electron remains **43.1.0**.

### Added

- **cpm package manager (Phases 0–4 complete)** — cutover guide: [docs/cpm-cutover.md](docs/cpm-cutover.md)
  - **Phase 4:** product no longer bundles classic apm (Node 12); packaging/CI use **cpm** only; `apm` remains a **shim → cpm**
  - **Phase 3:** prefer native **prebuilds** before source rebuild (`chevron.prebuilds`, `prebuild-install`, then `@electron/rebuild`); `--force-source`; [docs/cpm-prebuilds.md](docs/cpm-prebuilds.md)
  - **Phase 2:** registry client (`search`, `view`, install-by-name via Pulsar API; `CPM_REGISTRY_URL`)
  - **Phase 1:** `@chevron/cpm` under `cpm/` — Electron-as-Node CLI (`list`, `doctor`, `install`, `uninstall`, `link`, `rebuild --no-color`)
    - Launchers `cpm` / `apm` shims; product packaging copies `app/cpm`; `getApmPath()` prefers cpm
    - Shell installer installs `cpm` + `apm` shim; Windows `resources/win/cpm.cmd` + Squirrel PATH
    - `engines.atom` / `engines.chevron` checks on install; compile-cache policy (b) runtime-only
    - Install smoke + rebuild contract tests
- **Security Phase N2.1:** settings-view avatar cache writes/lists/deletes only via main-process IPC under `userData/Cache/settings-view` (basename allowlist + size cap)

### Changed

- **Phase 0 bootstrap:** root app `node_modules` via **host npm** (not apm/Node 12)
  - `package-lock.json` → lockfileVersion 3; root `.npmrc` with `legacy-peer-deps=true`
  - `script/bootstrap-modern` uses `install-app-dependencies.js`; `--with-apm` is debug-only (not CI/product)
  - Bundled `packageDependencies` stay root `dependencies` (design §13.5 Option A)
- **Secondary tooling** no longer invokes classic apm for monorepo installs (`script/test`, `update-dependency`, `run-apm-install` → host npm; `getApmBinPath` → monorepo cpm shim)
- **First-run / onboarding** (`packages/welcome`): Welcome/Guide copy documents **cpm** (and `apm` shim); removed Atom sunset/telemetry consent; Teletype card removed
- **User migration (cutover):** prefer `cpm …`; existing `apm …` scripts keep working via shim; Settings installer uses cpm; registry defaults to Pulsar — see [docs/cpm-cutover.md](docs/cpm-cutover.md)
- **Settings package search / featured / install UI** use Pulsar registry APIs (not dead atom.io); registry patch re-applied after Coffee transpile in the package build
- Session handoff (`GROK.md`) rewritten for post-cpm baseline; **next epic = Security Phase N**

## [0.3.0] — 2026-07-18

Polish release: brand mark, icons, and first-run product language.

### Added

- New **Chevron app icon** (double-chevron mark, indigo→cyan) for stable/beta/nightly/dev
  - `resources/app-icons/<channel>/chevron.icns`, `.ico`, and `png/*`
  - Legacy `atom.icns` / `atom.ico` kept as copies for residual paths
- In-app **Chevron wordmark** (About + Welcome) replacing the Atom orbital logo
- README hero with the new mark; status table for 0.3.0 capabilities

### Changed

- Welcome guide product-facing copy → Chevron
- Packaging prefers the `chevron` icon basename (macOS/Windows/Linux)

## [0.2.0] — 2026-07-18

First multi-platform packaging baseline and Chevron product identity.

### Added

- **Windows CI**: bootstrap, build, zip package, launch smoke test (`windows-2022` + MSVC)
- **macOS dual-arch CI**: Intel (`macos-15-intel` / x64) and Apple Silicon (`macos-15` / arm64)
- **Linux arm64 CI**: bootstrap, build, packages, smoke (alongside x64)
- **Linux packages**: required `.deb`, `.rpm`, and `.tar.gz` artifacts on x64 and arm64
- **Chevron branding** (dual-support forever for Atom packages):
  - Bundle ID `dev.builtbygio.chevron` (+ helper)
  - Config home: `CHEVRON_HOME` → `ATOM_HOME` → `~/.chevron` if present → `~/.atom`
  - URI schemes: `atom://` (package API) + `chevron://` alias
  - Shell commands: `chevron`, `atom`, and `apm` (compatibility)
- **Tooling rename (P5)**: internal `atomnova_*` helpers → `chevron_*` (with short-lived aliases)

### Fixed

- Native rebuilds for Electron 43 on Windows (MSVC, `ArrayBuffer::Data()` ABI, spellchecker, tree-sitter languages)
- Squirrel apm shim naming for `chevron.exe` (no longer string-replaces `atom`→`apm` on the wrong stem)
- Dev-mode / module-cache recognition of package name `chevron`
- Soft-fail custom mksnapshot when Electron 43 context snapshot generator exits non-zero
- Skip empty macOS symbols zip when `dump_syms` is unavailable (e.g. arm64)

### Changed

- Product name and packaging IDs default to **Chevron** / `chevron` (stable channel)
- Runtime crash reporter and about/welcome copy point at `builtbygio/chevron`
- Electron remains **43.1.0**

### Compatibility

Unchanged public Atom ecosystem surface:

- `global.atom` / `require('atom')` / `engines.atom`
- Primary package URI scheme `atom://`
- Default config dir still `~/.atom` when no Chevron-specific home is set
- `apm` command name

## [0.1.0] — earlier

Initial Chevron tree: Electron modernization, modern host bootstrap (`bootstrap-modern`), Linux x64 packaging path, and early rebrand of `package.json` to `chevron` / `Chevron`.

---

[Unreleased]: https://github.com/builtbygio/chevron/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/builtbygio/chevron/releases/tag/v1.0.1
[1.0.0]: https://github.com/builtbygio/chevron/releases/tag/v1.0.0
[0.6.0]: https://github.com/builtbygio/chevron/releases/tag/v0.6.0
[0.5.0]: https://github.com/builtbygio/chevron/releases/tag/v0.5.0
[0.4.0]: https://github.com/builtbygio/chevron/releases/tag/v0.4.0
[0.3.0]: https://github.com/builtbygio/chevron/releases/tag/v0.3.0
[0.2.0]: https://github.com/builtbygio/chevron/releases/tag/v0.2.0
