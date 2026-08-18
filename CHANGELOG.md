# Changelog

All notable changes to **Chevron** are documented in this file.

Chevron is a modernised fork of [Atom](https://github.com/atom/atom). Historical Atom releases are archived at the upstream project; this log covers Chevron only.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Removed the `global.atomApplication` alias** (H3 PR 23 branding pass). The main-process application singleton is `global.chevronApplication` only; the 7 readers across `auto-update-manager`, `application-menu`, `context-menu` and `squirrel-update` were converted. No Atom-named global remains in the product. Local variables and parameters named `atomApplication` are deliberately untouched — they are not the global, and renaming them is churn with no behaviour change.

- All 10 remaining owned pins publish `chevron://` URIs (H3 PR 23.3): `settings-view` (12 refs), `github` (3), `keybinding-resolver` (2), `timecop` (2), and one each in `find-and-replace`, `notifications`, `snippets`, `spell-check`, `styleguide`, `tree-view`. With the 4 in-repo packages converted earlier, **no bundled package emits an `atom://` URI**. Core still accepts `atom://` — the workspace scheme fallback and the protocol handler both keep it — so deep links users already have continue to work. `script/ci/no-atom-uri.test.js` guards it.

- Workspace openers match either product URI scheme (H3 PR 23.3). If no opener claims a `chevron://` URI, `openSync` and `createItemForURI` retry it as `atom://`, and vice versa. Openers do their own matching — `settings-view` uses `uri.startsWith('atom://config')` — so without this a migrated caller would silently stop matching an unmigrated opener and the pane would simply never open. The 22 `atom://` URIs in the in-repo packages (`about`, `deprecation-cop`, `incompatible-packages`, `welcome`) are now `chevron://`; the 11 owned pins can follow one at a time.

- **Removed `global.atom`** (H3 PR 23 slice 5). `github` 0.37.11, `tree-view` 0.229.5 and `autocomplete-chevron-api` 0.10.10 stop using `atom` as a *value* (`typeof atom`, `.bind(atom)`, `atom && …`, `atom[name]`), which the bulk conversion missed because it only rewrote `atom.x`. The CI harnesses that evaluate the global inside the app — `script/ci/smoke-test.js` and `script/ci/measure-startup.js` — now read `chevron`. The editor sets `global.chevron` only; `global.atom` is undefined and `require('atom')` is `MODULE_NOT_FOUND`. This is the deletion slice 2 attempted and had to walk back — it is safe now that the conversion stream moved 1347 references across 54 bundled packages. The Jasmine harness sets its own `window.atom` (`spec/jasmine-test-runner.js`), so the ~7500 `atom.` references in spec files are unaffected. `global.atomApplication` is a different object and is unchanged.
- CoffeeScript is gone from the owned packages (H3 PR 23). 26 grammar specs across 20 `language-*` pins converted with `decaffeinate` and renamed to `.ts`, plus `language-less/update.coffee`. Each repo gains a `spec/globals.d.ts` for the Jasmine harness globals. `spec/jasmine-test-runner.js` now collects `-spec.ts`; it still matches `-spec.coffee` so a stale spec fails loudly rather than being skipped. **These specs could not run before**: PR 11 removed the CoffeeScript compilers and the runner `require()`s spec files, so a `.coffee` spec threw. The only CoffeeScript left is two `spec/fixtures/sample.coffee` files in `autosave` and `bookmarks`, which are test *data* and must stay. `script/ci/no-coffee.test.js` guards it.

- All 37 owned `builtbygio` package pins use the `chevron` global instead of `atom` (H3 PR 23 stream, batch). 1136 references converted across the pins, on top of 211 in-repo in the previous slice — 1347 in total. `script/ci/no-atom-global.test.js` now covers the pins as well as `packages/`. Also rescued the `github` pin: it referenced commit `50f4ba0d`, which was reachable from **no branch** — fetchable by SHA so installs worked, but one GC away from breaking permanently. It now lives on `chevron/atom-global`.

- In-repo bundled packages use the `chevron` global instead of `atom` (H3 PR 23 stream, slice 1 of ~39). 211 references across 17 packages. `script/ci/no-atom-global.test.js` guards `packages/*/lib` and `packages/*/src` against regression; it masks string literals and skips comments, so selectors like `"atom-text-editor"` and paths like `'../static/atom.less'` are untouched. The 38 owned `builtbygio` pins (1147 references) follow one repo at a time; `global.atom` can only be dropped once they are done.

- **Removed** `exports/atom.js` and the `atom` module-cache builtin (H3 PR 23 slice 2). `require('atom')` now fails with `MODULE_NOT_FOUND` instead of resolving to a deprecated shim. Core no longer *reads* `global.atom` anywhere — the `global.chevron || global.atom` fallbacks in `src/lsp/**` are gone. **`global.atom` itself stays**: 1360 bare `atom.` references survive across 57 bundled packages (40 of them external pins), so removing the global is a catalog conversion stream, not a core edit. `global.atomApplication` in the main process is a **different** object and is unchanged.
- **Removed** the `atom` and `apm` shell-command shims (H3 PR 23 slice 4). `Install Shell Commands` now installs `chevron` and `cpm` only, and startup auto-install does the same — it previously installed `atom` and `apm` and never `chevron`. `cpm/bin/apm` still ships: cpm declares it as a published bin and has a contract test for it, so retiring it belongs to a cpm release.

- `chevron://` is the product URI scheme (H3 PR 23 slice 3). `atom://` stays a **deprecated alias** that still resolves, warning once when used. Fixes a real bug: `chevron://` was registered with the OS but `URIHandlerRegistry.handleURI` rejected any scheme other than `atom:`, so a `chevron://` deep link resolved and then failed. Default-protocol registration and all user-facing prompt copy now lead with `chevron://`; the "dual-support forever" comment is gone. Deleting `atom://` is **not** done — 15 bundled packages still publish `atom://` URIs, 10 of them external pins.

- **Removed** `exports/atom.js`, the `global.atom` alias, and the `atom` module-cache builtin (H3 PR 23 slice 2). `require('atom')` now fails with `MODULE_NOT_FOUND` instead of resolving to a deprecated shim, and `global.atom` is undefined. Core no longer reads the alias anywhere — the `global.chevron || global.atom` fallbacks in `src/lsp/**` are gone. `global.atomApplication` in the main process is a **different** object and is unchanged; renaming it is the branding pass, not this PR.

- Core reads `chevron.*`, not the legacy `atom` global (H3 PR 23 slice 1). 59 bare `atom.` references across 21 files in `src/` now use `chevron.`. Behaviour-neutral while `global.atom` still exists; it is the prerequisite for deleting the alias, since the shim cannot go while core still reads it. Comments and message strings referencing `atom.*` are untouched.
- `src/package-host-eligibility.ts` is TypeScript, and `script/ci/src-typescript-first.test.js` now runs in CI. The guard existed but was never invoked, so Epic 21 landed six new `src/**/*.js` files against PR 16's TypeScript-first policy without CI noticing. `src/main-process/**` is now an explicit, documented exemption: main registers no TypeScript compile-cache, and utilityProcess entries are forked by literal path whose extension differs between dev and packaged builds. A companion assertion fails if any `.ts` appears under an exempt directory, so the exemption cannot quietly widen.
- Windows userData lives in `%LOCALAPPDATA%\chevron` (H3 PR 23b). `generate-metadata.js` writes `chevron` / `chevron-<channel>` instead of the Atom-era names. **No migration ships**: the owner confirmed there is no Windows install base, so there is no userData to orphan and a copy-forward migration would have been permanent boot-path complexity guarding a loss that cannot happen. The migration was designed (#199) and implemented (#206), then discarded once the premise was checked.

- TextMate is a **permanent supported fallback** (H3 PR 22 closed as not applicable, owner decision 2026-08-17). first-mate + oniguruma stay, wrapped and lazy-loaded (PR 14). The 13b port stream is finished and the 12-row keep-TextMate list in [docs/language-stack.md](docs/language-stack.md) will not empty: `language-hyperlink` and `language-todo` are injection grammars other packages depend on, `language-text` is plain text, `language-source` has no grammar. Deleting the TextMate engine would regress plain-text highlighting, TODO/FIXME scopes and hyperlink injection.
- All 94 bundled `packageDependencies` now declare `engines.chevron` (H3 PR 23 prerequisite). The 21 in-repo packages that previously declared only `engines.atom` — 8 themes plus `about`, `autoflow`, `dalek`, `deprecation-cop`, `dev-live-reload`, `git-diff`, `go-to-line`, `grammar-selector`, `incompatible-packages`, `line-ending-selector`, `link`, `update-package-dependencies`, `welcome` — gain `"chevron": "*"`. `engines.atom` stays until PR 23 removes the name surface.
- Windows userData migration plan ([docs/windows-userdata-migrate.md](docs/windows-userdata-migrate.md)) — the gate H3 PR 23b depends on. Design only, no code: copy-never-move out of `%LOCALAPPDATA%\atom`, skip regenerable caches, never overwrite newer data, one-shot marker, fail open, `CHEVRON_SKIP_USERDATA_MIGRATE=1` escape. Splits the work so the migration lands inert before the name flip, which is the irreversible half.
- `atom-select-list` 0.8.2 uses `require('chevron')` and `global.chevron` (H3 PR 23 prerequisite). It was the last `builtbygio` pin reaching for the Atom names, and `git-diff` / `grammar-selector` / `line-ending-selector` depend on it. `script/ci/owned-require-chevron.test.js` is now wired into `ci.yml` — it existed but was never run, which is why this went unnoticed.

- Package host v2 documentation (H3 Epic 21, slice 21.5): [package host design](docs/security-phase-s-package-host.md) records what is built vs still owed; [package-node-policy](docs/package-node-policy.md) gains "Writing a host-eligible package" for T2 authors; [cpm-design](docs/cpm-design.md) states plainly that the Pulsar registry is a client implementation, not a product store — T2 reopening depends on the host, not a registry URL. Architecture doc marks Epic 21 slices landed and records that **routing is still off**.
- Package host v2 hybrid routing (H3 Epic 21, slice 21.4): `src/package-host-eligibility.js` decides whether a package may run in the host. Implements the design doc's **(B) Hybrid** slice — pure-logic community packages go to the host; anything touching the DOM (`document`, `window`, `createElement`, `customElements`, etch/React, workspace panels, view registry) stays editor-side under the v1 require policy. Packages needing privileged Node also stay in-process, so a policy error is not converted into an activation failure. `package.json` `chevronPackageHost: "eligible" | "editor"` overrides the heuristics in both directions. Detection is conservative by design: a false "needs DOM" costs nothing, a false "eligible" blanks a UI. Routing is inert unless `core.packageHostV2` / `CHEVRON_PACKAGE_HOST_V2` is on.
- Package host v2 services (H3 Epic 21, slice 21.3): `providedServices` / `consumedServices` cross the process boundary as **descriptors** (name, version, method list) rather than live objects, with each side building an RPC proxy. Host packages can provide services the editor calls, and consume editor-side services through a reverse `host-request` channel. Late offers reach already-active consumers, and each consumer method is called at most once per service version. Range matching uses a small internal semver subset (`*`, exact, `^`, `~`, comparators) because the host must load in CI's `unit-and-cpm` job, which never runs a root `npm ci`.
- Package host v2 activation (H3 Epic 21, slice 21.2): the host can now activate **logic-only** packages. `workers/package-host-require.js` is a restricted loader — package code gets the stub proxy for `require('chevron')`/`require('atom')`, and privileged ids, native addons and `.node` bindings throw unconditionally (no `CHEVRON_RESTRICT_PACKAGE_REQUIRES` escape, unlike the in-process v1 policy). `workers/package-host-stub.js` implements the RPC-friendly `chevron.*` surface: `config` served from a snapshot pushed at activate time, `commands` (selector-string targets only), `notifications`, `workspace.open` by URI, plus `Disposable`/`CompositeDisposable`. Contributions stream to the editor as descriptors. Fixtures in `spec/fixtures/packages/package-host-{logic-only,privileged}`.
- Package host v2 bootstrap (H3 Epic 21, slice 21.1): `src/main-process/package-host-manager.js` supervises a `chevron-package-host` `utilityProcess` defined by `src/main-process/workers/package-host.js`, reachable over allowlisted `chevron:package-host-*` IPC. The host boots, answers `ping`/`describe`/`shutdown`, and **loads no packages yet** — activation lands in 21.2. Gated by `core.packageHostV2` (default `false`). See [docs/security-phase-s-package-host.md](docs/security-phase-s-package-host.md).

### Fixed

- Load `tree-sitter-perl` (ESM syntax, no `"type":"module"`) through `node-gyp-build` instead of `require()`. Electron treated that file as a SyntaxError and smoke treated the fatal grammar notification as a hard fail.

### Changed

- `language-ruby-on-rails` 0.26.0 ships the Rails dialect grammars and snippets as JSON (H2 PR 13c). `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-sass` 0.64.0 ships the TextMate `source.css.scss`, `source.sass`, and `source.sassdoc` grammars, settings, and snippets as JSON (H2 PR 13c). Tree-sitter stays default for SCSS. `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-objective-c` 0.17.0 ships the `source.objc`, `source.objcpp`, and `source.strings` grammars, settings, and snippets as JSON (H2 PR 13c). `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-git` 0.20.0 ships the `text.git-commit`, `source.git-config`, and `text.git-rebase` grammars, settings, and snippets as JSON (H2 PR 13c). `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-csharp` 1.3.0 ships the TextMate `source.cs`, `source.csx`, and `source.cake` grammars, settings, and snippets as JSON (H2 PR 13c). Tree-sitter stays default for C#. `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-xml` 0.37.0 ships the TextMate `text.xml` and `text.xml.xsl` grammars, settings, and snippets as JSON (H2 PR 13c). Tree-sitter stays default for XML. `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-property-list` 0.10.0 ships the `source.plist` and `text.xml.plist` grammars, settings, and snippets as JSON (H2 PR 13c). `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-php` 0.50.0 ships the TextMate `text.html.php` and `source.php` grammars, settings, and snippets as JSON (H2 PR 13c). Tree-sitter stays default. `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-perl` 0.40.0 ships the TextMate `source.perl` and `source.perl6` grammars, settings, and snippets as JSON (H2 PR 13c). Tree-sitter stays default for Perl 5. `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-coffee-script` 0.51.0 ships the `source.coffee` and `source.litcoffee` grammars, settings, and snippets as JSON (H2 PR 13c). `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-clojure` 0.24.0 ships the TextMate `source.clojure` grammar, settings, and snippets as JSON (H2 PR 13c). Tree-sitter stays default. `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-yaml` 0.34.0 ships the TextMate `source.yaml` grammar and settings as JSON (H2 PR 13c). Tree-sitter stays default. `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-toml` 0.22.0 ships the TextMate `source.toml` grammar and settings as JSON (H2 PR 13c). Tree-sitter stays default. `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-sql` 0.27.0 ships the TextMate `source.sql` grammar and settings as JSON (H2 PR 13c). Tree-sitter stays default. `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-mustache` 0.15.0 ships the `text.html.mustache` and `source.sql.mustache` grammars as JSON (H2 PR 13c). `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-make` 0.24.0 ships the `source.makefile` grammar and settings as JSON (H2 PR 13c). `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-less` 0.36.0 ships the TextMate `source.css.less` grammar and settings as JSON (H2 PR 13c). Tree-sitter stays default. `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-gfm` 0.91.0 ships GFM settings and snippets as JSON (H2 PR 13c). Grammar was already JSON. `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-todo` 0.30.0 ships the `text.todo` injection grammar and snippets as JSON (H2 PR 13c). `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `github` 0.37.9: GitHub App device-flow login (classic PAT fallback); `electron.remote` dropped from `directory-select.js` and `git-timings-view.js` (8B). Inbox stays. **Not** gone from the package: 7 files still use `require('electron').remote` — `Menu`/`MenuItem` in `actionable-review-view.js`, `staging-view.js`, `conflict-controller.js`, `issueish-list-controller.js`; `BrowserWindow` in `worker-manager.js`; `getCurrentWindow()` in `event-logger.js` and `git-shell-out-strategy.js`. These block PR 20 (`exports/remote.js` delete) until the github epic.

- `github` 0.37.7: mutations and paging use `graphql-client`; `react-relay` / `relay-runtime` dropped (8B). Inbox stays.

- `github` 0.37.4: issue/PR detail, reviews pane, comment decorations, and create-repo dialog use `graphql-client` instead of Relay `QueryRenderer` (8B). First-page reviews only; load-more/refetch/reaction mutations are stubs. Inbox stays.

- `github` 0.37.3: open-PR search and checked-out PR lists use `graphql-client` instead of Relay `QueryRenderer` (8B). Inbox stays.

- `github` 0.37.2: GitHub tab header and remote repo lookup use `graphql-client` instead of Relay `QueryRenderer` (8B). Inbox stays.

- `github` 0.37.1: recovered GraphQL operations from Relay artifacts; issue/PR and @mention hover tooltips use `graphql-client` instead of Relay `QueryRenderer` (8B). Inbox stays.

- `github` 0.37.0: React 18.3 and `createRoot` (8B first slice). Inbox stays. Relay 5 / graphql@14 stay (compiled artifacts). Login pane uses a classic GitHub PAT, not `github.atom.io`.

- First-mate / oniguruma boot when a TextMate grammar is **assigned** to a buffer, not at GrammarRegistry construct (H2 PR 14). Tree-sitter-only sessions do not load the NAN addon. first-mate is not deleted.

- fuzzy-finder 1.15.1 and symbols-view 0.118.6 no longer call `Task` (H2 PR 14a). Path crawl and project tags run in-process. `Workspace.replace` still uses `Task`. `Task` is not deleted.

- Default UI/syntax themes are `chevron-dark-ui` / `chevron-dark-syntax`. Theme-manager fallback matches. `one-dark-*` stays bundled. Config-schema and settings-view product copy say Chevron (H2 PR 17). `Package.getType()` is `'chevron'`. Does not change Windows userData name.

- New `src/` files are TypeScript. Existing `src/**/*.js` is grandfathered and converted only when already being edited (H2 PR 16). CI bans new `.js` under `src/`. No mass rename.

- Replace deprecated `vscode-ripgrep@1.9.0` with `@vscode/ripgrep@1.15.14` (H2 PR 15). Same CJS `rgPath` / `bin/rg` layout. Bootstrap fallback now fetches `microsoft/ripgrep-prebuilt` v13.0.0-13 (native darwin-arm64). Not 1.18 (ESM + optionalDependencies).

- `language-text` 0.8.0 ships the `text.plain` grammar and snippets as JSON (H2 PR 13c). `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-hyperlink` 0.18.0 ships the `text.hyperlink` injection grammar as JSON (H2 PR 13c). `season` stays. See [docs/language-stack.md](docs/language-stack.md).

- `language-source` 0.10.0 ships `.source` editor settings as JSON (H2 PR 13c). `season` stays — other language pins still ship CSON. See [docs/language-stack.md](docs/language-stack.md).

- C# highlighting defaults to tree-sitter (`tree-sitter-c-sharp@0.23.5` via `builtbygio/language-csharp` 1.2.0). Official grammar with npm prebuilds. `source.csx` and `source.cake` stay TextMate. TextMate `csharp.cson` stays as the fallback. See [docs/language-stack.md](docs/language-stack.md).

- Clojure highlighting defaults to tree-sitter (`tree-sitter-clojure-orchard@0.2.8` via `builtbygio/language-clojure` 0.23.0). No official `tree-sitter/tree-sitter-clojure`; oakmac `0.4.0` is 2019/`nan` and is not used. TextMate `clojure.cson` stays as the fallback. Bootstrap rebuilds the N-API addon (no npm prebuilds). See [docs/language-stack.md](docs/language-stack.md).

- Perl highlighting defaults to tree-sitter (`tree-sitter-perl@1.2.1` via `builtbygio/language-perl` 0.39.0). Perl 6 / Raku stays TextMate. TextMate `perl.cson` stays as the fallback. Bootstrap rebuilds the N-API addon (no npm prebuilds). See [docs/language-stack.md](docs/language-stack.md).

- SCSS highlighting defaults to tree-sitter (`tree-sitter-scss@1.0.0` via `builtbygio/language-sass` 0.63.0). Indented Sass and SassDoc stay TextMate. TextMate `scss.cson` stays as the fallback. See [docs/language-stack.md](docs/language-stack.md).

- Less highlighting defaults to tree-sitter (`mdovale/tree-sitter-less` via `builtbygio/language-less` 0.35.0). No published npm package; bootstrap rebuilds the N-API addon. TextMate `less.cson` stays as the fallback. See [docs/language-stack.md](docs/language-stack.md).

- SQL highlighting defaults to tree-sitter (`@derekstride/tree-sitter-sql@0.3.11` via `builtbygio/language-sql` 0.26.0). No official `tree-sitter/tree-sitter-sql`; this is the maintained grammar. TextMate `sql.cson` stays as the fallback. See [docs/language-stack.md](docs/language-stack.md).

- TOML highlighting defaults to tree-sitter (`@tree-sitter-grammars/tree-sitter-toml@0.7.0` via `builtbygio/language-toml` 0.21.0). TextMate `toml.cson` stays as the fallback. See [docs/language-stack.md](docs/language-stack.md).

- PHP highlighting defaults to tree-sitter (`tree-sitter-php@0.24.2` via `builtbygio/language-php` 0.49.0). `text.html.php` uses the HTML+PHP grammar; `source.php` uses `php_only`. TextMate `html.cson` / `php.cson` stay as fallbacks. See [docs/language-stack.md](docs/language-stack.md).

- XML highlighting defaults to tree-sitter (`@tree-sitter-grammars/tree-sitter-xml@0.7.0` via `builtbygio/language-xml` 0.36.0). `text.xml.xsl` and the TextMate `xml.cson` stay as fallbacks. See [docs/language-stack.md](docs/language-stack.md).

- YAML highlighting defaults to tree-sitter (`@tree-sitter-grammars/tree-sitter-yaml@0.7.1` via `builtbygio/language-yaml` 0.33.0). TextMate `yaml.cson` stays as the fallback. See [docs/language-stack.md](docs/language-stack.md).

- Catalog of every bundled `language-*`: tree-sitter, TextMate-only, or both, with a named owner and **port** / **keep TextMate** decision. See [docs/language-stack.md](docs/language-stack.md). This is the H2 exception list — first-mate stays. `GrammarRegistry.getParserKindCounts()` reports live TextMate vs tree-sitter grammar counts.

- Windows x64 cold start (GHA `windows-2022`, custom snapshot): median wall **2,734 ms**; workspace-ready **1,585 ms**; require interval **15 ms**. Darwin stock snapshot is **frozen** (no constructor bisection). Linux/Windows keep the custom snapshot. `measure-startup.js` finds `Chevron x64/chevron.exe` via `find-packaged-app`. See [docs/startup-snapshot-plan.md](docs/startup-snapshot-plan.md) §4.9–§4.10.

- Compile-cache no longer registers Coffee or Babel-prefix compilers. TypeScript and CSON stay. `src/babel.js` and `src/coffee-script.js` are deleted.

- New tests are `node:test` under `script/ci/`. Dropped Coffee/Babel no-op transpile from `script/build` and unused script `babel-core@5`. Kept CSON pack-time transpile, `script/test`, and donna/coffeelint (still invoked).

- Git workers are **utilityProcess only**. The emergency Node BrowserWindow path (`CHEVRON_ALLOW_PACKAGE_WORKER_BROWSERWINDOW`) is gone. `atom-create-browser-window-sync` always refuses.

- First-party display IPC uses `invoke` (`chevron:get-primary-display-work-area-size`, `chevron:get-user-default`). Sync `atom.confirm` and `remote-compat` `sendSync` twins stay. `require("remote")` is deprecated as unsupported.

- First-party `atom-*` elements are constructed via `createCustomElement` / factories. `document-register-element` stays for owned pins and etch/React host tags.

- Packaging uses `@electron/packager` 18.4.4 instead of `electron-packager` 15. Output names, asar unpack globs, fuses, and Linux `Chevron-linux-<arch>` layout are unchanged. `electron-link` / custom snapshot stay.

- User `~/.chevron` config, keymap, and snippets default to JSON. Existing `*.cson` still load; the first boot copies them to `*.json` and leaves the CSON in place. Escape: `CHEVRON_CONFIG_CSON=1`. `season` stays for pin CSON.

- `Workspace.scan` is ripgrep only. Deleted `DefaultDirectorySearcher` / `scan-handler` and dropped the `scandal` dependency (replace already left it). `CHEVRON_SEARCH_ENGINE=scandal` and `options.ripgrep === false` no longer switch engines. `Task` stays for fuzzy-finder, symbols-view, and replace.

- Find-in-project ripgrep is spawned from main (`chevron:rg-search-start` / cancel), not `child_process.spawn` in the preload searcher. JSON-line adapter and event semantics are unchanged. `shell: false`.

- Project replace no longer uses scandal `PathReplacer`. Closed files are rewritten with JS `RegExp` (same semantics as the open-buffer path). `Task` still hosts the worker. Scandal remains for the search escape hatch.

- Find-in-project defaults to ripgrep. `find-and-replace.useRipgrep` is now `true`. `Workspace.scan` treats an omitted `options.ripgrep` as ripgrep. One-release escape: set the pin to `false` and/or `CHEVRON_SEARCH_ENGINE=scandal`. Scandal search and `Task` stay.

- Architecture target is [docs/chevron-architecture-modernization.md](docs/chevron-architecture-modernization.md). Living docs no longer teach Atom dual-support, apm Node 12, or `Task` as the package-author worker. `docs/atom-architecture.md` is a current-state sketch that defers to that target. Custom V8 snapshot status in `docs/build-modernization.md`: Linux/Windows on, Darwin stock.
- Own remaining unowned core loaders as `builtbygio` git pins: `first-mate@7.4.3`, `atom-keymap@8.2.15`, `atom-select-list@0.8.1`, `season@6.0.2`, `scandal@3.2.0`, `text-buffer@13.18.6`, `fs-admin@0.15.0`, `scrollbar-style@4.0.1`. Each ships compiled `lib/` from the npm tarball (several Atom git tags were Coffee-only or missing the published version). `prepare`/`prepublish` that `rimraf lib/` are no-ops. Overrides hoist nested copies (including text-buffer’s `fs-admin@0.19` and owned-package `atom-select-list@0.7.2`) to the same SHAs.
- Bootstrap force-copy of monorepo superstring/watcher no longer includes `packages/*/build/` and only runs when natives are actually rebuilt, so a warm cache cannot ship a host-Node `.node`. `link-package-natives-to-root` no longer copies `tree-sitter`.
- `./script/build` without `--no-bootstrap` no longer calls the dead `script/bootstrap` stub. A bootstrapped tree packages; a cold tree prints the `bootstrap-modern` commands.
- Own the remaining 22 TextMate-only `language-*` packages (`#79`). No `atom/*` app git pins left.
- Pre-transpile `builtbygio/github` `lib/` to CJS and drop `atomTranspilers`. Packaging no longer runs a host Babel 7 install inside that package.
- Custom V8 snapshot stays **stock on Darwin**. CI #125 generated a valid pair on both Mac archs then the process died at smoke (`app exited during startup`). Linux/Windows keep the custom snapshot. `CHEVRON_FORCE_MKSNAPSHOT=1` still retries.
- Mac arm64 bootstrap: `ensure-ripgrep` was dying on an unauthenticated GitHub API 403 (`microsoft/ripgrep-prebuilt` v12.1.1). Pass `GITHUB_TOKEN`, `--force` when `bin/rg` is missing, and fall back to the release asset URL.
- Jasmine (#57) first nightly: every renderer spec crashed on `jasmine-node` `failure-tree.coffee` (#62). Ship a compiled stand-in. `AtomWindow` tests no longer require `resourcePath` / `Atom` in the window title.

### Fixed

- Fatal-error **Create Issue** card files on `builtbygio/chevron` instead of archived `atom/atom`. The dead atom.io updates check no longer leaves the button unwired.
- LSP no longer fails silently: notify when no server is registered or the project is untrusted (`lsp-ui` stays on first paint). Discover `chevron-lsp-*` binaries installed under `~/.chevron/packages` so cpm installs work without PATH. `chevron-lsp-typescript` no longer requires `event-kit` (user-home packages cannot see app `node_modules`). Opening a project shows a Chevron-themed trust modal; the choice is saved in `trusted-projects.json`.
- Closing a split pane (Markdown Preview) no longer strips the surviving pane’s DOM. Welcome Guide **Open Installer** / **theme picker** activate `settings-view` before opening `atom://config/*`. Crash / recovery dialogs say Chevron and point at `builtbygio/chevron`.
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
