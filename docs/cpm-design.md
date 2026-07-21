# cpm — Chevron Package Manager (design)

**Status:** design (authoritative)  
**Date:** 2026-07-19  
**Product version context:** post-0.3.0 brand/polish; cpm is a later major milestone (e.g. 0.4.x / 0.5.x)  
**Related:** [cpm-design-eli5.md](./cpm-design-eli5.md) (plain-language companion), [REBRANDING.md](./REBRANDING.md)  
**Replaces over time:** bundled `apm` (`atom-package-manager@2.6.2`)

---

## 1. Purpose

Build **cpm** (Chevron Package Manager): a modern package installer and lifecycle tool for Chevron that:

1. Runs on the **product Electron binary** via `ELECTRON_RUN_AS_NODE=1` (no bundled Node 12; ABI always matches the editor).
2. Installs **Atom-compatible packages** (dual-support forever).
3. Rebuilds natives against **product Electron** (currently 43.x) via a clear path.
4. Improves **supply-chain / install-time security** relative to classic apm.
5. Ships as **`cpm`**, with **`apm` as a long-lived shim** for muscle memory and scripts (including Windows `apm.cmd` and shell/PATH install).

cpm is **not** a rewrite of the editor’s package loader (`PackageManager`, `global.atom`). It is the **installer and rebuild CLI** (and later, registry client).

---

## 2. Goals and non-goals

### Goals

| ID | Goal |
|----|------|
| G1 | Remove Node 12 + npm 6 + node-gyp 5 from the critical package-install path |
| G2 | Install community packages into dual-home packages dirs (`~/.chevron` / `~/.atom`) |
| G3 | Honour `engines.atom` and optional `engines.chevron` |
| G4 | Rebuild natives for `package.json` / product `electronVersion` without ambient `npm_config_*` pollution |
| G5 | Default-safe installs (ignore lifecycle scripts; integrity where available) |
| G6 | Keep GUI package UX working via `core.apmPath` → cpm (**settings-view** and **incompatible-packages** rebuild flow) |
| G7 | Document a path to prebuilds and a registry without requiring them in v1 |
| G8 | Honour the **in-app rebuild contract** (`Package.runRebuildProcess`: spawn `… rebuild --no-color`, parse `code`/`stdout`/`stderr`) |
| G9 | Preserve **compile-cache** behaviour when install/rebuild runs under the product Node (see §5.7) |

### Non-goals (v1–v2)

| ID | Non-goal |
|----|----------|
| N1 | VS Code–style extension host isolation (separate process, capability API only) |
| N2 | Full Marketplace product (billing, publisher org verification at MS scale) |
| N3 | Replacing `global.atom` / `require('atom')` package API |
| N4 | Bundling a private Node binary with cpm |
| N5 | Forking and maintaining npm 6 forever (Pulsar’s ppm choice) as the end state |
| N6 | Forcing all existing packages to republish under a new format on day one |

### Dual-support forever (locked)

From product rebrand decisions:

- Keep **`engines.atom`**, **`atom://`**, **`global.atom`**, **`apm` name as alias**.
- Default config home remains compatible with **`~/.atom`** when no Chevron home is set.
- Do not break honest community packages that still declare Atom engines.

---

## 3. Landscape: how others do package management

### 3.1 Atom — `apm`

**Model:** Specialized **npm wrapper** that:

- Bundles **its own Node + npm**.
- Spawns npm with flags so **native modules compile against Electron/Chromium V8**, not host Node.
- Installs packages to **`~/.atom/packages`** (not app-local `node_modules` for user packages).
- Historically talked to **atom.io** for search/featured/publish (registry dead since Dec 2022).
- Treats packages as **directories with `package.json`**, loaded in-process with broad editor trust.

**Roles apm played in the Atom tree (and still in Chevron):**

| Role | Description |
|------|-------------|
| A | Build-time install of app dependencies |
| B | Runtime install of community packages |
| C | Native rebuild (`apm rebuild`) |
| D | Registry client (search / featured) |
| E | User-facing CLI in the app bundle |
| F | Soft compatibility checks (`engines.atom`) |

**Chevron today:** A–C are partially split — modern bootstrap uses apm for install, then **host/modern node-gyp** for Electron 43. D is largely broken without a live registry. E–F still matter for UX and ecosystem.

### 3.2 Pulsar — `ppm`

**Model:** **Maintained fork of apm** ([pulsar-edit/ppm](https://github.com/pulsar-edit/ppm)).

- Still an npm-wrapper architecture.
- Still effectively on an **npm 6 lineage** (Pulsar ships a **patched npm 6.14.x** tarball, not stock npm 10+).
- Binary may still be named **`apm`** for compatibility.
- Registry: Pulsar’s [package-backend](https://github.com/pulsar-edit/package-backend) rehosts the archived atom.io corpus + community.

**Lesson:** Maximum ecosystem continuity; **does not** escape the “wrapper around old npm” maintenance tax. Good **reference** and possible **temporary registry**, not Chevron’s long-term architecture.

### 3.3 VS Code — marketplace + VSIX (no apm)

**Model:** Not an npm fork.

| Concern | VS Code |
|---------|---------|
| Identity | `publisher.name`, `engines.vscode` |
| API | Isolated `vscode` module via extension host |
| Artifact | **`.vsix`** (sealed zip + manifest) |
| Distribution | Marketplace API + `vsce` |
| Install | Editor/CLI places extension in managed dir |
| Natives | Prefer **prebuilt / platform-specific** artifacts at publish time |
| Trust | Publisher accounts, marketplace policy, takedowns; runtime isolation |

**Lesson:** Strong protection and UX come from **sealed artifacts + marketplace + runtime isolation**. cpm can adopt install-time integrity and later prebuilds; **full VS Code security is a platform project**, not a CLI rename.

### 3.4 What Chevron should take from each

| Source | Adopt | Avoid |
|--------|--------|--------|
| Atom | Package **directory format**, `engines.atom`, packages dir layout | Bundled Node 12, dead atom.io as sole trust root |
| Pulsar | Compatibility posture, registry corpus as **optional backend** | Committing forever to npm 6 under the hood |
| VS Code | Sealed artifacts (later), prebuilds, install transparency, permissions *later* | Pretending cpm alone equals extension-host security |

**Chosen strategy:** *“Modern apm”* — new CLI that runs under **`ELECTRON_RUN_AS_NODE=1` on the product binary** (locked in §5.2; **not** host Node) + modern fetch/install libraries (`pacote` / arborist / `@electron/rebuild`) + Atom package layout retained.  
**Not:** pure ppm black-box dependency as the end state.  
**Not:** VS Code extension host as the package-manager milestone.  
**Not:** a long-lived host-Node cpm process (that was an earlier sketch; superseded by §5.2).

---

## 4. Current Chevron constraints (why rewrite is large)

| Constraint | Impact |
|------------|--------|
| apm **Node 12** | No official darwin-arm64 Node 12; Rosetta / patches (`patch-apm-download-node`) |
| apm **npm 6** | lockfile v1 quirks; `fix-package-lock.js`; host npm 10+ warns/errors on random `npm_config_*` |
| apm **node-gyp 5** | Cannot configure Electron ≥ 20 headers; Electron rebuild must be out-of-band |
| atom.io dead | Search/featured/publish via stock apm are broken |
| Dual toolchain | Host Node 24 for product; Node 12 for apm — bootstrap complexity and dual npm confusion |
| Full-trust packages | Even a perfect installer cannot sandbox `activate()` without runtime changes |

---

## 5. Architecture

### 5.1 High-level

```text
┌──────────────────────────────────────────────────────────────┐
│  CLI: cpm                                                     │
│  Shim: apm → cpm (compat)                                     │
├──────────────────────────────────────────────────────────────┤
│  Commands                                                     │
│   install | uninstall | upgrade | outdated | list             │
│   link | unlink | rebuild | search | view | doctor | ci       │
│   publish (later)                                             │
├──────────────────────────────────────────────────────────────┤
│  Services                                                     │
│   Resolver  — name | git URL@sha | path | tarball             │
│   Fetcher   — pacote / GitHub / registry API                  │
│   Installer — extract + dependency tree (arborist in-process) │
│   Rebuild   — @electron/rebuild for product electronVersion   │
│   Index     — pluggable search (Pulsar API / static index)    │
│   Config    — ~/.chevron/.cpmrc (+ dual-read Atom paths)      │
│   Policy    — scripts off by default, integrity, allowlists   │
└──────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
  packages directory              Electron headers
  (dual home)                     from product electronVersion
```

### 5.2 Runtime identity

| Item | Value |
|------|--------|
| Package name | `@chevron/cpm` (or `chevron-package-manager`) |
| Binary | `cpm` / `cpm.cmd` |
| Compat binary | `apm` / `apm.cmd` → exec `cpm` (optional deprecation notice on stderr) |
| Language | TypeScript |
| **Process model (locked)** | **`ELECTRON_RUN_AS_NODE=1` + product executable** — always the same Node/V8 ABI as the running editor |
| No bundled Node 12 | cpm does **not** ship apm’s download-node / Rosetta Node 12 tree |

**Decision (locked):** cpm’s default entrypoint is **not** host `node`. Launchers set:

```text
ELECTRON_RUN_AS_NODE=1
<path-to-Chevron|chevron.exe> <path-to-cpm-main> <args…>
```

Same pattern as Electron tools that must match the app ABI. This:

- Removes Rosetta / Node 12 download hacks.
- Aligns native rebuild and **compile-cache** (see §5.7) with the product engine.
- Makes `Package.runRebuildProcess` rebuilds trustworthy without a separate Electron headers dance from host Node.

**CI / developers** may still run unit tests under host Node for pure logic; **integration and packaging** use ELECTRON_RUN_AS_NODE.

### 5.3 Install locations (dual-support)

Resolution order for **package home** (aligned with `src/atom-paths.js`):

1. `CHEVRON_HOME` if set  
2. `ATOM_HOME` if set  
3. Portable `.chevron` / `.atom` beside the app (if present and writable)  
4. `~/.chevron` if it exists  
5. else `~/.atom` (default — preserve existing users)

Layout:

```text
$PACKAGE_HOME/
  packages/           # community packages
  .cpm/               # cache, logs, lock metadata (new)
  .apm/               # optional: read legacy cache; do not require for writes
```

**Write policy:** prefer `~/.chevron/packages` when the user is on a Chevron home; otherwise write to `~/.atom/packages` so dual-support users keep one tree.

### 5.4 App build vs user packages

| Path | Today | Target |
|------|--------|--------|
| App `node_modules` / bootstrap | apm install + modern rebuild | **Phase 0:** host `npm ci` / `npm install` + modern node-gyp force rebuild |
| User community packages | apm | **cpm** (Phase 1) |
| Bundled `packageDependencies` | same root install (also in `dependencies`) | **§13.5 Option A — RESOLVED** (host npm) |

**Sequencing:** Phase 0 decouples root app install from apm; Phase 1 ships cpm for user packages.

### 5.5 Command surface (v1)

| Command | Behavior |
|---------|----------|
| `cpm install [name\|url\|path]` | Resolve → fetch → install → deps → rebuild if native |
| `cpm uninstall <name>` | Remove package dir |
| `cpm upgrade [name]` | Update within policy (pinned ranges / lock) |
| `cpm outdated` | Compare installed vs index |
| `cpm list` | Scan packages dir |
| `cpm link` / `unlink` | Dev packages |
| `cpm rebuild [name]` | See **§5.5.1 rebuild contract** (required) |
| `cpm search <query>` | Index backend |
| `cpm view <name>` | Metadata |
| `cpm doctor` | Paths, Electron-as-Node, headers, natives, scripts policy |
| `cpm ci` | Clean install from lock (app or package) for CI |

Support `--json` where settings-view / tools expect machine-readable output (match apm shapes where practical).

#### 5.5.1 Rebuild contract (wider than settings-view)

In-app rebuild is **not** only a settings-view concern. The hard contract lives in core and the bundled UI package:

| Caller | Behaviour today |
|--------|-----------------|
| `Package.runRebuildProcess` (`src/package.js`) | Spawns `getApmPath()` with args **`['rebuild', '--no-color']`**, `cwd` = package path; aggregates **stdout/stderr**; invokes callback with **`{ code, stdout, stderr }`** |
| `Package.rebuild()` | Promise resolving to that object; on non-zero `code`, stores **stderr** in localStorage for failure UI; clears incompatible-native cache keys |
| `packages/incompatible-packages` | Drives rebuild UI (`rebuildIncompatiblePackages`); depends on the same exit/stderr semantics and user-visible rebuild status |

**cpm requirements:**

1. **`cpm rebuild`** (and the `apm rebuild` shim) must accept at least:
   - `rebuild` with no package name → rebuild in **cwd** (matches `runRebuildProcess` which only passes `rebuild --no-color`).
   - Optional package name / path flags for CLI convenience (superset of apm).
2. **`--no-color`** must be accepted and suppress ANSI (or be a no-op if cpm never emits color).
3. **Exit code:** `0` on success; non-zero on failure (same as apm).
4. **stderr** must contain human-readable failure detail suitable for `getBuildFailureOutput()` / incompatible-packages UI (do not only print to a log file).
5. **stdout** may be empty or informational; do not break parsers that only check `code` + `stderr`.
6. Rebuild must run under **ELECTRON_RUN_AS_NODE** (product binary) so natives match the editor.

Regression tests (Phase 1): spawn cpm as the editor does (`BufferedProcess`-equivalent) and assert the result object shape used by `Package.rebuild()`.

### 5.6 Libraries (preferred)

| Concern | Library / tool | Status |
|---------|----------------|--------|
| Fetch package tarball / git | `pacote` | **Primary** |
| Dependency tree / install | **`@npmcli/arborist` as a library, in-process** under ELECTRON_RUN_AS_NODE | **Primary** — avoids spawning the full npm CLI |
| Electron natives | `@electron/rebuild` | **Primary** |
| Semver / engines | `semver` | **Primary** |
| CLI | `yargs` or `commander` | **Primary** |
| Dependency tree fallback | ~~`npm install --prefix` under ELECTRON_RUN_AS_NODE~~ | **STRUCK (Phase 1)** — never implemented; arborist path is sole install core |

**Primary path (locked):** cpm loads `pacote` + **arborist in-process**. No `npm install --prefix` escape hatch in production code.

**Avoid:** vendoring full npm 6; ambient Electron `npm_config_*` on host npm; spawning the npm CLI under Electron-as-Node. Pass Electron options **only** into `@electron/rebuild`.

### 5.7 compile-cache coupling

`src/compile-cache.js` is documented as used **when the package installer runs under Atom/Electron’s Node** during install/update of packages (CoffeeScript/JS/TS transpile + cache under `$ATOM_HOME/compile-cache`).

**Implication for cpm:**

| Topic | Requirement |
|-------|-------------|
| Engine parity | Install/rebuild that transpile package sources must see the **same V8/Node** as the editor → further argument for **ELECTRON_RUN_AS_NODE** (locked in §5.2), not host Node 24 vs Electron’s Node mismatch. |
| `compile-cache.install` | **RESOLVED (b):** cpm does **not** load app compile-cache at install. Runtime compile-cache handles CoffeeScript/JS/TS on activation. Revisit (a) only if a known package set needs install-time precompile for cold-start. |
| Cache directory | Continues under package home (`compile-cache` under ATOM_HOME / CHEVRON_HOME); cpm must not invent a third cache root without migration. |
| Design default | **(b) locked for Phase 1** |

Phase 1 acceptance: at least one CoffeeScript community package installs and activates without host-Node-only syntax/runtime skew (runtime compile-cache).

### 5.8 Windows and shell shims (Phase 1 scope)

cpm must land as a **first-class Windows citizen**, not only “covered by CI later.” Explicit artifacts and call sites:

| Surface | Today | cpm Phase 1 |
|---------|--------|-------------|
| Bundled CLI wrappers | `resources/win/apm.cmd` → `..\app\apm\bin\apm.cmd` | Ship **`cpm.cmd`** and **`apm.cmd`** (shim → cpm) under the same layout consumers expect |
| Packaged resources | `package-application.js` copies `apm.cmd`, `apm.sh`, `atom.cmd`, … into `resources/cli/` | Also copy **`cpm.cmd`** / **`cpm`**; keep **`apm.cmd`** shim; update any channel-specific generation if it assumes only `apm` |
| In-app PATH install | `src/command-installer.js` installs `apm` (and chevron) into `/usr/local/bin` on macOS | Install **`cpm`** + **`apm`** shim; Windows: document PATH via Squirrel / installer, not only macOS symlinks |
| Squirrel / Windows PATH | `src/main-process/squirrel-update.js` writes `apm.cmd` / `apm` shims next to channel exe | Write **cpm** shims and **apm → cpm** shims; do **not** derive apm name by string-replacing `atom` in the exe stem (already fixed for `chevron.exe` — keep that invariant) |
| `PackageManager.getApmPath()` | Resolves `apm.cmd` under `resources/app/apm/bin` (or nested atom-package-manager) | Resolve **cpm** first or map apm path to **cpm launcher**; `core.apmPath` may override |
| `CONFIG.getApmBinPath()` / bootstrap | `apm.cmd` on win32 | Parallel `getCpmBinPath()`; bootstrap Phase 0 may still call apm until cutover |
| Symlink / junction dance | Packaging and install scripts create links into `app/apm/...` | Document exact relative paths for `resources/cli/apm.cmd` → `../app/cpm/...` (or single `app/cpm` tree with apm.cmd inside `bin/`) so Windows shortcuts and relative `%~dp0` wrappers keep working |

**Windows launcher sketch:**

```bat
@echo off
set ELECTRON_RUN_AS_NODE=1
"%~dp0\..\..\Chevron.exe" "%~dp0\cpm.js" %*
```

(Exact relative depth depends on final bundle layout; `package-application.js` and Squirrel must stay in sync.)

**Phase 1 checklist (Windows):**

- [ ] `apm.cmd` and `cpm.cmd` present in packaged app  
- [ ] `getApmPath()` returns a path that implements §5.5.1  
- [ ] Squirrel PATH install creates working `cpm` / `apm` commands  
- [ ] `incompatible-packages` rebuild succeeds on Windows CI  

---

## 6. Threat model and security

### 6.1 Trust model (honest statement)

**Today and under cpm v1 runtime:** community packages still load with **editor-level trust** (classic Atom). They can use Node `fs`, `child_process`, network, and `atom` APIs once activated.

**cpm reduces the chance of installing known-bad or tampered code.**  
**cpm does not sandbox a package the user activates.**  

Full runtime protection requires a later **permissioned package runtime** / isolation milestone (VS Code–like). That is out of scope for cpm v1 but must be acknowledged in product messaging.

### 6.2 Threat stages

| Stage | Example | Primary control owner |
|-------|---------|------------------------|
| Before install | Typosquat, malicious git history, compromised maintainer | Source policy, allowlists, pins |
| At install | `postinstall` malware, evil native binary, tarball swap | ignore-scripts, integrity, rebuild policy |
| After install | Token theft, exfiltration, reverse shell in `activate()` | Runtime isolation (future), safe mode, easy disable |

### 6.3 Install-time controls (cpm v1 must implement)

| Control | Default | Notes |
|---------|---------|-------|
| Lifecycle scripts | **Off** (`--ignore-scripts`) | Largest free win vs classic npm/apm |
| Allow scripts | Opt-in `--allow-scripts` + warning | Power users only |
| Git installs | Require **commit SHA** (reject bare branch) | Reproducibility |
| Integrity | Record hashes in `.cpm` lock / metadata | Fail closed on mismatch when known |
| Natives | Detect `binding.gyp` / `.node`; **warn or confirm** | Optional “block natives” safe profile |
| Unknown sources | Strict mode: curated index only | Loose mode: explicit URL flag |
| Logs | Source, version, hash, time, cpm version | Forensics |
| `apm` shim | Same policy as `cpm` | No weaker path |

### 6.4 Optional metadata (forward-compatible)

Packages may declare:

```json
"chevron": {
  "permissions": ["workspaceFs", "network", "shell", "clipboard"]
}
```

cpm v1: **display and soft-gate** (e.g. refuse `shell`+`network` without `--i-accept-risk`).  
Runtime enforcement: **later platform work**.

### 6.5 Product / CI supply chain

Separate from end-user packages:

- Pin app dependencies with lockfile integrity.
- No unpinned git branches in product builds.
- SBOM for releases (later).
- Bundled packages reviewed; community packages never auto-bundled without pin.

### 6.6 Layered security (roadmap)

```text
Layer 4  Runtime isolation / permissions     ← future platform
Layer 3  Activation policy (safe mode, trust) ← medium
Layer 2  cpm install integrity + no scripts   ← cpm v1
Layer 1  Source trust (allowlist, pins)       ← cpm v1
Layer 0  Transparency + easy uninstall        ← cpm v1 + UI
```

---

## 7. Registry strategy

| Phase | Backend | Rationale |
|-------|---------|-----------|
| Now / cpm v1 | Optional client for **Pulsar package-backend** (atom.io corpus + community) **or** static curated JSON index | Search/install works without Chevron infra |
| Later | Chevron-owned **static index** (GitHub Pages / object storage) → GitHub release tarballs | No always-on server |
| Optional | npm scope for pure JS packages | Familiar publish path; not required for Atom-format packages |

**Do not** hard-depend on dead atom.io APIs.

Respect licenses and Pulsar terms if proxying their API; document attribution.

---

## 8. Native modules and prebuilds

### v1

- Install source tree.
- Rebuild with `@electron/rebuild` targeting product `electronVersion` and headers URL (`https://www.electronjs.org/headers` or product config).
- Prefer no install scripts; rebuild is cpm’s job.

### Later (VS Code lesson)

- `cpm publish` CI workflow produces platform artifacts (darwin-x64/arm64, linux-x64/arm64, win32-x64).
- `cpm install` prefers matching prebuild; falls back to source rebuild.
- Common packages become pure downloads; hackable source path remains for developers.

---

## 9. Compatibility matrix

| Feature | apm | cpm v1 | Notes |
|---------|-----|--------|-------|
| Install by name | yes | yes | Via index/registry |
| Install git URL | yes | yes | SHA preferred/required |
| Install path / link | yes | yes | Dev workflow |
| `engines.atom` | yes | yes | Dual-support |
| `engines.chevron` | no | yes | Optional stricter gate |
| Rebuild for Electron | partial / outdated gyp | yes | Modern rebuild under ELECTRON_RUN_AS_NODE |
| `rebuild --no-color` + `{code,stdout,stderr}` | yes (`Package.runRebuildProcess`) | **required** | §5.5.1; incompatible-packages UI |
| Search | broken (atom.io) | yes if backend configured | |
| Publish | broken / legacy | later | |
| settings-view | via `core.apmPath` | point to cpm | `--json` where needed |
| compile-cache at install | apm Node loads app compile-cache | **(b) runtime only** | §5.7 locked for Phase 1 |
| Windows `apm.cmd` / PATH | yes | yes | §5.8 |
| Full package sandbox | no | no | Documented limitation |

---

## 10. Implementation phases

### Phase 0 — Decouple **app build** from apm (may land before cpm CLI)

**No new brand required; high ROI.**

- Replace bootstrap app install with **host `npm ci` / `npm install`** + **`@electron/rebuild`**.
- Regenerate root lockfile for modern npm (lockfileVersion 2/3) when ready.
- Remove bootstrap dependency on: apm Node 12 download, `patch-apm-npm`, `patch-apm-download-node`, npm-6-only lock fixer for app path (or shrink scope).
- Keep apm binary only for **user** package installs until Phase 1–2.

**Success:** CI multi-platform green without apm for app `node_modules`.

### Phase 1 — cpm v1 CLI (user packages) — **DONE** (2026-07-21)

| Item | Status |
|------|--------|
| In-repo `cpm/` package | Done (#25) |
| ELECTRON_RUN_AS_NODE launchers + `apm` shims | Done |
| Install: pacote + arborist in-process; scripts off by default | Done; path/git/registry smoke (#26) |
| Commands: install / uninstall / list / link / rebuild / doctor | Done (`search` deferred to Phase 2) |
| Rebuild §5.5.1 (`rebuild --no-color`, `{code,stdout,stderr}`) | Done — contract tests in `cpm/test/rebuild-contract.test.js` |
| Dual package home | Done |
| `getApmPath` / shell / Squirrel / `resources/win` | Done |
| compile-cache §5.7 **(b)** runtime-only | Done |
| §5.6 `npm --prefix` fallback | **Struck** — not shipped |
| Packaging copies `app/cpm` (+ install deps if missing) | Done |

**Success (Phase 1):**

- [x] `cpm install` pure-JS path + git + registry (host-node smoke; product Electron preferred for natives)
- [x] Rebuild contract shape for editor spawn (`rebuild --no-color`)
- [x] No silent npm-CLI fallback under Electron-as-Node
- [ ] Optional dogfood: open incompatible-packages UI in a built app (manual)

**Not in Phase 1 (later):** registry search/view (Phase 2), prebuilds (Phase 3), remove apm tree (Phase 4).

### Phase 2 — Registry client

- Configurable API base URL (Pulsar backend and/or static index).
- `search` / `view` / install-by-name restored for users.

### Phase 3 — Prebuilds

- Publish workflow + install preference for platform binaries.

### Phase 4 — Retire apm tree

- Remove `apm/` bundle from product; keep `apm` shim → cpm for a deprecation window; then optional removal.

### Suggested version framing

Keep **two paths** distinct when reading this table:

| Path | Process | Tooling lean |
|------|---------|--------------|
| **User / in-app packages** | Always **`ELECTRON_RUN_AS_NODE=1`** + product binary (§5.2) | **cpm** (Phase 1+) |
| **App bootstrap / root `node_modules`** | Host Node at build time | **host `npm ci` / `npm install` + `@electron/rebuild`** (Phase 0; open detail §13.4 — pure host npm is the default lean, not “cpm for bootstrap”) |

| Product | Package manager |
|---------|-----------------|
| 0.3.x | apm remains; polish only |
| 0.4.x | Phase 0 (bootstrap off apm → host npm) + Phase 1 (cpm for user packages, `apm` shim) |
| 0.5.x | Phase 2 (registry client); bootstrap **stays** host npm + `@electron/rebuild` unless §13.4 is reopened |
| Later | Phase 3–4 (prebuilds; retire apm tree) |

Exact version numbers are editorial; effort is multi-PR.

---

## 11. Repository layout (proposed)

```text
cpm/                          # or packages/cpm
  package.json                # bin helpers; real entry is JS under Electron-as-Node
  bin/cpm                     # unix: sets ELECTRON_RUN_AS_NODE, exec product + main
  bin/cpm.cmd                 # windows
  bin/apm                     # shim → cpm
  bin/apm.cmd                 # shim → cpm.cmd
  src/
    cli.ts
    commands/
    paths.ts                  # dual home (share rules with atom-paths)
    resolve.ts
    install.ts
    rebuild.ts                # §5.5.1 contract
    registry.ts
    policy.ts                 # scripts, integrity, allowlists
    doctor.ts
  README.md
resources/win/
  cpm.cmd                     # packaged relative wrapper (like apm.cmd today)
  apm.cmd                     # shim → cpm.cmd
docs/cpm-design.md            # this file (authoritative)
docs/cpm-design-eli5.md       # plain-language companion
```

Editor integration:

- Ship cpm in app resources (replace or sit beside `app/apm`).
- `atom.packages.getApmPath()` / config `core.apmPath` → **cpm launcher** path (still named apm path API).
- Shell command installer + Squirrel: install **`cpm` and `apm` shim** (§5.8).

---

## 12. Testing strategy

| Layer | Tests |
|-------|--------|
| Unit | Resolver, path dual-home, engines checks, policy flags |
| Integration | Install fixture package into temp ATOM_HOME/CHEVRON_HOME |
| Native | Rebuild fixture with binding.gyp against Electron headers (CI matrix) |
| Smoke | Launch Chevron; settings-view list/install; **incompatible-packages rebuild** |
| Rebuild contract | Spawn `getApmPath()` / cpm with `rebuild --no-color`; assert `{ code, stdout, stderr }` |
| Windows packaging | Assert `apm.cmd` / `cpm.cmd` exist and resolve under ELECTRON_RUN_AS_NODE |
| Regression | Multi-platform CI (linux x64/arm64, macOS x64/arm64, Windows) |

Security tests: assert scripts do not run by default; assert branch-only git URL rejected; assert hash mismatch fails.

---

## 13. Open decisions (resolve during Phase 0–1 implementation)

1. **Default package write home:** always `~/.atom/packages` vs prefer `~/.chevron/packages` when Chevron home exists.  
2. **~~cpm process: host Node vs ELECTRON_RUN_AS_NODE~~ — RESOLVED:** always **`ELECTRON_RUN_AS_NODE=1` + product binary**. Host Node only for unit tests of pure logic. See §5.2, §5.7.  
3. **Registry default:** Pulsar API vs Chevron static index first.  
4. **~~Root app `node_modules` install~~ — RESOLVED (Phase 0):** pure **host npm** (`npm ci` / `npm install --ignore-scripts --legacy-peer-deps`) + modern Electron rebuild in `bootstrap-modern`. Not cpm. Optional `--with-apm` only for packaging/dev until Phase 1.  
5. **~~Bundled `packageDependencies` at build time~~ — RESOLVED Option A (2026-07-21):** all 91 entries are also root `dependencies` (`file:` + git pins). Host npm install of the app tree is sufficient; `packageDependencies` remains a metadata map for runtime/build. Spike: [cpm-phase-0-spike.md](./cpm-phase-0-spike.md).  
6. **~~compile-cache at install (§5.7)~~ — RESOLVED:** policy **(b)** runtime-only transpile (cpm does not load app compile-cache at install).  
7. **Strict mode default** for end-user builds vs developer builds.  
8. **~~`npm install --prefix` under ELECTRON_RUN_AS_NODE (§5.6)~~ — STRUCK:** never implemented; arborist-only install core.

Document further resolutions in §15 when closed.

---

## 14. Success criteria (definition of done for “apm replaced”)

- [ ] No Node 12 binary required for package install or app bootstrap.  
- [ ] No dependency on stock atom.io for search/install.  
- [ ] `cpm install` / rebuild works on all CI platforms for a representative set of packages (pure JS + one native).  
- [ ] **§5.5.1** rebuild contract: in-app / incompatible-packages rebuild works via `getApmPath()`.  
- [ ] **§5.8** Windows `apm.cmd` / `cpm.cmd` / Squirrel PATH / package-application CLI copy.  
- [ ] **§5.7** compile-cache policy documented and verified with at least one CoffeeScript package.  
- [x] **§13.5** `packageDependencies` build-time strategy decided (**Option A**) and used in Phase 0 bootstrap.  
- [ ] `apm` shim preserves common user scripts.  
- [ ] Install scripts off by default; doctor documents risk.  
- [ ] Product docs state install-time vs runtime security limits honestly.  
- [ ] apm bundle removable from release artifacts after deprecation window.

---

## 15. Document history

| Date | Change |
|------|--------|
| 2026-07-19 | This design: landscape (Atom/Pulsar/VS Code), architecture, threat model, phases |
| 2026-07-19 | Lock ELECTRON_RUN_AS_NODE; rebuild contract §5.5.1; compile-cache §5.7; Windows shims §5.8; packageDependencies as §13.5 |
| 2026-07-19 | Fix §3.4 (drop superseded “host Node” strategy) and §10 version framing (bootstrap = host npm, not cpm) vs §5.2 / §13.4 |
| 2026-07-19 | §5.6: arborist in-process is primary; demote `npm install --prefix` to spike-gated / strike-if-flaky (§13.8) |
| 2026-07-19 | Add `cpm-design-eli5.md`; drop superseded proposal as a required companion |
| 2026-07-21 | Phase 0: resolve §13.4/§13.5 (host npm + Option A); bootstrap-modern off apm for app deps |
| 2026-07-21 | Phase 1: lock compile-cache (b); Squirrel/Windows cpm PATH; engines checks |
| 2026-07-21 | Phase 1 complete: strike §5.6 npm-prefix fallback; rebuild contract tests; packaging ensures cpm deps |

---

## 16. Summary

**cpm** is an **Electron-as-Node package installer** (`ELECTRON_RUN_AS_NODE=1`) for the **existing Atom package format**, with **strict install-time defaults** and a path to **prebuilds + registry**. It must honour the **in-app rebuild contract** and **Windows packaging shims**, not only settings-view JSON. It deliberately does **not** claim VS Code–level runtime isolation on day one.

**Pulsar** shows how to keep the ecosystem alive with an apm fork.  
**VS Code** shows the end-state security model (artifacts + isolation + marketplace).  
**Chevron** should take Pulsar’s compatibility goals and VS Code’s install-time discipline, then earn runtime security in a later platform milestone—not by pretending a package manager rewrite alone makes third-party code safe.
