# Phase 0 — Step 1 inventory

**Historical.** Phase 0–4 shipped. Do not treat this as current procedure: host npm + `bootstrap-modern` is the path; `patch-apm-*` / `patch-natives-*` / `patch-packages-remote-ipc.js` are **deleted**. See [bootstrap-patch-matrix.md](../reference/bootstrap-patch-matrix.md) and [cpm-phase-4-complete.md](./cpm-phase-4-complete.md).

**Branch:** `feat/phase-0-host-npm-bootstrap`  
**Date:** 2026-07-21  
**Purpose:** Map every place apm touches **app build / bootstrap**, so Phase 0 can replace root install with host npm without guessing.

Related: [cpm-design.md](../reference/cpm-design.md) §5.4, §10 Phase 0, §13.5; [bootstrap-report.md](../reference/bootstrap-report.md).

---

## 1. Executive summary

| Question | Answer |
|----------|--------|
| How does root `node_modules` get installed today? | **`runApmInstall(repoRoot)`** → `apm ci` / `apm install` (Node 12 + npm 6) |
| Is apm required only for that? | **No** — also for installing apm itself, build-time per-package installs (custom transpilers), dependency fingerprint, product packaging of apm, and (later) **user** packages |
| Can host npm see bundled packages? | **Likely yes for layout:** all **91** `packageDependencies` are also listed under `dependencies` (26× `file:packages/…`, 65× git pins) |
| Lockfile | **lockfileVersion 1** (npm 6). Host npm 11 will need regen or careful migration |
| Delete `bootstrap-modern`? | **No** — edit steps 2–4; keep host prep, patches, Electron rebuild |
| Phase 0 out of scope | Product `getApmPath()`, settings-view, shell `apm`, cpm CLI |

**If `runApmInstall(repositoryRoot)` is removed without a host-npm replacement, these break:**

1. Default bootstrap app deps (CI + local)  
2. Anything assuming root `node_modules` populated by that step  
3. Indirectly: build steps that expect `node_modules/<packageDependency>`  

**Still broken or separate if only root install is fixed:**

- Build step `transpile-packages-with-custom-transpiler-paths` still calls `runApmInstall` **per package**  
- Product still ships apm (Phase 1/4)  
- Fingerprint still embeds apm version  

---

## 2. `bootstrap-modern` pipeline (today)

File: `script/bootstrap-modern` (~406 lines).

| Step | What | apm? | Phase 0 action |
|------|------|------|----------------|
| 0 | `modern-env.sh` (Node/Python/CXXFLAGS/`ATOM_ELECTRON_URL`) | No | **Keep** |
| 1 | `verifyMachineRequirements`, fingerprint clean, `installScriptDependencies` | No (host npm in `script/`) | **Keep** |
| 2 | `installApm(ci, {ignoreScripts})` + patch apm gyp/npm + Node 12 download + rebuild apm natives | **Yes — critical path** | **Remove from default path** (optional `--with-apm` later) |
| 3 | `apm --version` gate | **Yes** | **Remove** when root install does not need apm |
| 4a | `fix-package-lock.js` (npm 6 quirks) | Yes (for apm) | **Drop** after modern lockfile |
| 4b | `runApmInstall(repositoryRootPath, ci)` + `npm_config_ignore_scripts` | **Yes — app deps** | **Replace** with host `npm ci` / `npm install` |
| 4c | force-patched superstring, context-aware, keytar nan, spellchecker, nested nan, remote IPC, tree-view, V8 patches | No | **Keep** |
| 4d | Electron rebuild: `npm rebuild` + modern node-gyp force list; optional `apm rebuild`; keytar electron-rebuild | **Partial apm** | **Keep modern path; drop apm rebuild fallback** |
| 4e | dugite postinstall, superstring sanity | No | **Keep** |
| 5 | `dependencies-fingerprint.write()` | Fingerprint **includes apm version** | **Update** formula when apm not required |

Call sites inside bootstrap-modern:

```text
installApm(...)                          # ~line 87
runApmInstall(CONFIG.repositoryRootPath) # ~line 210
apm --version                            # ~line 183
apm rebuild (fallback)                   # ~line 299
```

---

## 3. Script helpers that invoke apm

| File | Role | Phase 0 |
|------|------|---------|
| `script/lib/run-apm-install.js` | `apm install` / `apm ci` in a path; optional ignore-scripts via `.npmrc` | Stop using for **repo root**; may remain until build custom-transpiler path migrated |
| `script/lib/install-apm.js` | Host `npm ci/install` into `apm/` for atom-package-manager | Optional / out of default bootstrap |
| `script/config.js` → `getApmBinPath()` | Resolves `apm/node_modules/atom-package-manager/bin/apm(.cmd)` | Keep until no script needs apm |
| `script/lib/fix-package-lock.js` | Rewrites lock for npm 6 / apm | Drop from default path after lock v2/3 |
| `script/lib/patch-apm-npm.js` | Patch apm’s nested npm 6 | Drop from default path |
| `script/lib/patch-apm-download-node.js` | darwin-arm64 → x64 Node 12 for apm | Drop from default path |
| `script/lib/link-package-natives-to-root.js` | After package-local apm install, link natives to root | Used by custom-transpiler build step |
| `script/lib/transpile-packages-with-custom-transpiler-paths.js` | **Build-time** `runApmInstall(rootPackagePath)` for packages with `atomTranspilers` | **Still apm** unless changed to `npm install` in package dir — **in Phase 0 scope if we claim “no apm for build”** |
| `script/lib/update-dependency/main.js` | Maintainer tooling: `runApmInstall(repositoryRootPath)` | Low priority; update when root install is host npm |
| `script/lib/dependencies-fingerprint.js` | Hash includes `atom-package-manager` version | Update when apm optional |
| `script/lib/clean-dependencies.js` | Deletes `apm/node_modules` + root `node_modules` | Keep cleaning both |

### Stock `script/bootstrap`

Already a **hard error** redirecting to `bootstrap-modern`. No separate apm path to inventory.

---

## 4. CI

File: `.github/workflows/ci.yml`

| Job | Bootstrap | Notes |
|-----|-----------|--------|
| macOS x64 / arm64 | `./script/bootstrap-modern --ci` | Node 24; comment still says “apm keeps bundled Node 12” |
| Linux x64 | same | |
| Linux arm64 | same | |
| Windows x64 | same (Git Bash) | |

All then: `./script/with-modern-env ./script/build --no-bootstrap` (+ package flags).

**Phase 0:** no workflow rename required if `bootstrap-modern` stays the entrypoint; update step comments when apm leaves the critical path.

---

## 5. `packageDependencies` (bundled packages)

### Counts (root `package.json`)

| Set | Count |
|-----|------:|
| `packageDependencies` | **91** |
| Also present in `dependencies` | **91** (100%) |
| Missing from `dependencies` | **0** |
| `file:./packages/…` (in-repo) | **26** |
| git/other pins | **65** |

In-repo `file:` packages include: themes (atom-*, one-*, solarized-*, base16-*), `about`, `welcome`, `git-diff`, `dalek`, `incompatible-packages`, `language-rust-bundled`, etc.

Git-pinned examples: `tree-view`, `settings-view`, `github`, `fuzzy-finder`, `find-and-replace`, …

**Implication for §13.5:** Option **A** (host `npm ci` / `npm install` of root `dependencies`) is the natural first experiment — bundled packages are already normal npm deps, not an apm-only side channel.  
`packageDependencies` remains a **metadata map** for runtime (`PackageManager`) and build (transpile, module cache, packaging filters).

### Build / runtime consumers of the map

| Consumer | Uses `packageDependencies` for |
|----------|--------------------------------|
| `script/lib/generate-module-cache.js` | Bundled package roots |
| `script/lib/generate-metadata.js` | Bundled package metadata in product |
| `script/lib/transpile-coffee-script-paths.js` | Paths under each package |
| `script/lib/transpile-babel-paths.js` | same |
| `script/lib/transpile-cson-paths.js` | same |
| `script/lib/transpile-peg-js-paths.js` | same |
| `script/lib/transpile-packages-with-custom-transpiler-paths.js` | same + **apm install in package** |
| `script/lib/prebuild-less-cache.js` | Themes / styles |
| `script/lib/include-path-in-packaged-app.js` | Allowlist packaging paths |
| `script/lib/package-application.js` | Avoid pruning non-standard field |
| `src/package-manager.js` | Bundled package names / versions |
| `src/module-cache.js` | Resolve bundled deps |
| `script/lib/update-dependency/*` | Outdated bundled package tooling |

Expected on-disk layout after install:

```text
node_modules/<packageName>/   # for every packageDependencies key
```

(plus nested deps). Intermediate app copy during build: `CONFIG.intermediateAppPath/node_modules/<name>`.

---

## 6. Product / runtime apm (out of Phase 0, do not break)

| Surface | File(s) | Phase |
|---------|---------|-------|
| `PackageManager.getApmPath()` | `src/package-manager.js` | Phase 1 |
| `Package.runRebuildProcess` | `src/package.js` | Phase 1 |
| Shell install `apm` | `src/command-installer.js` | Phase 1 |
| Bundle apm into app | `script/lib/package-application.js` | Phase 1/4 |
| Linux/mac installers link `apm` | `create-debian-package.js`, `create-rpm-package.js`, `install-application.js` | Phase 1/4 |
| Windows CLI wrappers | `resources/win/apm.cmd` | Phase 1 |
| Config `core.apmPath` | config schema / settings-view | Phase 1 |

Phase 0 may still **install** apm under `apm/` if packaging requires it on the same machine — but that must not be required to produce root `node_modules` for compile. Cleaner split: bootstrap host-npm for app; separate optional `install-apm` for packaging/dev until Phase 1 ships cpm.

---

## 7. Electron rebuild (today vs Phase 0)

Already mostly **not** apm’s node-gyp 5:

- Sets `npm_config_target` / `runtime=electron` / headers URL  
- `npm rebuild` then **force** modern node-gyp (or `npx node-gyp@11` on Windows) on critical packages  
- Optional `apm rebuild` fallback  
- keytar: electron-rebuild or node-gyp  

**Phase 0:** keep this behavior; optionally consolidate on `@electron/rebuild`; remove apm rebuild fallback.

Critical natives mentioned in bootstrap / bootstrap-report:  
`superstring`, `pathwatcher`, `git-utils`, `scrollbar-style`, `nslog`, `@atom/watcher`, `@atom/nsfw`, `@atom/fuzzy-native`, `keytar`, tree-sitter language bindings, …

---

## 8. Docs that still describe apm install for the app

| Doc | Note |
|-----|------|
| `docs/reference/bootstrap-report.md` | Historical success path is root `apm install` |
| `docs/reference/cpm-design.md` | Phase 0 target already documented |
| `docs/process/toolchain-node-python-upgrade-plan.md` | Assumes apm Node 12 for install |
| `docs/reference/atom-architecture.md` | Mentions apm Node 12 |
| CI workflow comments | “apm keeps bundled Node 12” |

Update in Phase 0 docs PR after behavior changes.

---

## 9. “If we stop calling X, what breaks?”

| Stop calling | Breaks |
|--------------|--------|
| `runApmInstall(repoRoot)` only | Empty/stale root `node_modules` unless host npm runs instead |
| Entire Step 2–3 (no apm binary) | Packaging that copies `apm/node_modules/atom-package-manager`; build custom-transpiler apm installs; local `apm` CLI until alternatives exist |
| `fix-package-lock` only | Harmless once lock is modern; harmful if still npm 6 apm install |
| `apm rebuild` only | Usually fine if modern gyp force list remains |
| `transpile-… custom … runApmInstall(package)` | Packages with `atomTranspilers` may miss Babel/devDeps for pre-transpile |

---

## 10. Recommended Phase 0 scope (from this inventory)

**Must change for “app deps without apm”:**

1. Root install: host `npm ci` / `npm install` instead of `runApmInstall(repoRoot)`  
2. Modern lockfile (leave lockfileVersion 1)  
3. Drop fix-package-lock + apm-only patches from **default** bootstrap path  
4. Electron rebuild without apm fallback  
5. Fingerprint without requiring apm install (or install apm only for packaging)  
6. CI green  

**Should change in same phase if claiming “build without apm”:**

7. `transpile-packages-with-custom-transpiler-paths.js` → host `npm install` in package dir (or reuse root hoisting) instead of `runApmInstall`

**Defer:**

- Product apm path / cpm (Phase 1)  
- Removing apm from ASAR/resources (Phase 4)  
- `update-dependency` maintainer scripts (follow-up)

**§13.5 lean after inventory:** **Option A** — host npm for root `dependencies` (includes all packageDependencies). Confirm in Step 2 spike.

---

## 11. Step 1 exit criteria

- [x] Root app install path identified (`runApmInstall` + helpers)  
- [x] apm install-of-apm path identified  
- [x] Lock / patch helpers listed  
- [x] packageDependencies counts and dual listing in `dependencies`  
- [x] Build consumers of packageDependencies listed  
- [x] CI entrypoints listed  
- [x] Product apm surfaces marked out of Phase 0  
- [x] Explicit “what breaks if …”  

**Next:** Step 2 — throwaway spike (done): see [cpm-phase-0-spike.md](./cpm-phase-0-spike.md).
