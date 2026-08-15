# How Chevron works (architecture)

**Audience:** developers studying or modifying the editor  
**Product:** Chevron — a modernized fork of Atom  
**Runtime:** Electron 43.1.0 (Chromium + Node ~24 in-app)  
**Current-state sketch.** The **target** (what to delete, wrap, or migrate next) is [chevron-architecture-modernization.md](./chevron-architecture-modernization.md). If this file disagrees with that one on intent, the modernization doc wins.

Chevron is a **hackable Electron 43 editor**. The package *model* (`activate` / services / keymaps / styles, `require('chevron')`, inspectable preload) stays. Atom-era *machinery* (CSON-as-config, `Task` fork workers, scandal search, TextMate as the default language engine, `electron-packager@15`, Jasmine-as-hero) does not.

---

## One-sentence model

**Main** owns OS, IPC, and supervised hosts.  
**Editor preload** owns the hackable UI + hot-path natives (Phase S **Option C**: Chromium `sandbox: false`).  
**Semantics** live in the LSP `utilityProcess`.  
**Syntax** is tree-sitter in-process, with TextMate as a supported fallback.  
**Packages** are Chevron services in the preload world (owned catalog).  
The **page world** is a thin shell without Node.

---

## High-level stack

```text
┌─────────────────────────────────────────────────────────────┐
│  Electron 43.1.0  (Chromium + Node ~24 in-app)              │
├─────────────────────────────────────────────────────────────┤
│  Main process (T0)                                          │
│  src/main-process/main.js → start.js → AtomApplication      │
│  • windows, menus, dialogs, shell                           │
│  • register-renderer-ipc / register-fs-ipc (allowlisted)    │
│  • package-utility-worker.js  → git utilityProcess          │
│  • lsp-worker-manager.js      → lsp-host.js                 │
├─────────────────────────────────────────────────────────────┤
│  Editor BrowserWindow — Option C                            │
│  ┌──────────────────────┐  ┌─────────────────────────────┐  │
│  │ Preload / isolated    │  │ Page world                   │  │
│  │ contextIsolation=true │  │ nodeIntegration=false        │  │
│  │ Node YES + natives    │  │ Node NO                      │  │
│  │ global.chevron lives  │  │ empty shell / custom els     │  │
│  │ packages activate     │  │                              │  │
│  │ tree-sitter 0.25      │  │                              │  │
│  │ first-mate fallback   │  │                              │  │
│  └──────────────────────┘  └─────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  utilityProcess hosts (no DOM)                              │
│  git-utility-host.js (dugite) · lsp-host.js (tsserver / …)  │
│  package host v2 — later, owner-gated                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Process model

### 1. Main process (Node, privileged)

Entry: `package.json` → `src/main-process/main.js` → `start.js`.

Responsibilities:

- Parse CLI, choose `resourcePath` (packaged asar vs dev repo)
- Create `AtomApplication` / `AtomWindow` (BrowserWindows)
- App menus, dialogs, `shell.openExternal`, protocol handlers (`chevron://`; `atom://` is a shim)
- **IPC hub** (`register-renderer-ipc.js`, `register-fs-ipc.js`) — allowlisted only
- Supervise **git** and **LSP** `utilityProcess` hosts

This is the only place that should talk freely to the OS for sensitive work. Find-in-project `rg` spawn moves here (architecture H1 PR 2b); today it still starts from the preload searcher.

### 2. Editor window (renderer)

Created in `atom-window.js` with roughly:

| Preference | Value | Meaning |
|------------|--------|---------|
| `nodeIntegration` | `false` | Page JS cannot use Node |
| `contextIsolation` | `true` | Preload and page are separate JS worlds |
| `preload` | `static/preload.js` | Boots the editor |
| `sandbox` | `false` | **Intentional** (Option C). Preload loads superstring / tree-sitter / oniguruma. Do not flip this as “modernization.” |

`global.chevron` (and the `AtomEnvironment` object behind it) lives in the **Electron Isolated Context** (preload), not the page. CDP debugging must target that context. `global.atom` is an unsupported shim.

### 3. Guests and workers

- **Guest `<webview>`s:** no Node; sandboxed prefs forced on attach.
- **Git:** `utilityProcess` (`package-utility-worker.js`). Node BrowserWindow workers are emergency-only (`CHEVRON_ALLOW_PACKAGE_WORKER_BROWSERWINDOW`).
- **LSP:** `utilityProcess` (`src/main-process/workers/lsp-host.js`).
- **`Task`:** still a renderer `child_process.fork` + fake DOM (`src/task.ts`, `task-bootstrap.js`). Callers: fuzzy-finder, symbols-view, `Workspace.replace`. Wrap-then-delete — not a public API to grow.

See [security-phase-s-decision.md](./security-phase-s-decision.md).

---

## Boot sequence (editor window)

```text
1. Main creates BrowserWindow + loads static HTML
2. static/preload.js runs in isolated world with Node
3. static/index.js sets up remote-compat (no electron.remote)
4. initialize-application-window.js builds AtomEnvironment
   (installs global.chevron; global.atom is a shim)
5. chevron.packages loads themes + owned packages
6. Workspace UI mounts: panes, docks, editors, status bar
7. Optional: welcome tabs, project paths from CLI, restore state
```

Packaged **Linux/Windows** builds may use a custom V8 snapshot (`snapshotResult`) so the CJS graph is evaluated into the isolate cache. **Darwin stays on Electron’s stock snapshots** (`packaging-policy.js` `darwin-boot-crash` — CI generated a valid pair then died at boot). Construction of `AtomEnvironment` is always runtime. See [packaging.md](./packaging.md).

---

## Core runtime objects (`require('chevron')`)

Packages and core talk through **`global.chevron`** (`AtomEnvironment` in `src/atom-environment.js`):

| Object | Role |
|--------|------|
| `chevron.workspace` | Center + docks, open items, panes, panels, find-in-project |
| `chevron.project` | Roots, buffers, path watching |
| `chevron.packages` | Activate/deactivate packages |
| `chevron.commands` | Keymap-bound commands |
| `chevron.config` | Settings (JSON preferred; CSON still dual-read) |
| `chevron.grammars` | tree-sitter first when `core.useTreeSitterParsers` is on; TextMate fallback |
| `chevron.styles` / `chevron.themes` | LESS/CSS UI & syntax themes |
| `chevron.notifications` | Toasts / errors |

`require('atom')` re-exports `require('chevron')` and warns once. That is **not** a community-compat product. Hard-delete is a dedicated later PR.

### Workspace layout

```text
atom-workspace          (tag names are still atom-*; factory conversion is H1)
├── center (WorkspaceCenter) — editors, welcome, settings, etc.
│   └── panes (split tabs)
├── left dock  — e.g. tree-view “Project”
├── right dock — e.g. github / git tabs
└── bottom dock — e.g. find results
```

**Items** are model objects (TextEditor, GuideView, …) with optional `getTitle` / `getURI` / `destroy`.  
**Views** are DOM elements registered via `ViewRegistry`. `document-register-element` is still required for package-constructed `atom-*` tags under isolation. Do not delete it after a `src/` grep.

### Text editing stack

```text
TextBuffer (text-buffer package)
    └── TextEditor (model)
            └── TextEditorComponent (DOM / layers / decorations)
                    └── markers + decorations (git-diff gutters, etc.)
```

Language: official **tree-sitter 0.25** where a grammar exists; **TextMate / first-mate / oniguruma** for the exception list (yaml, xml, php, sql, toml, …). first-mate is a supported fallback, not the default engine.

Find-in-project: `Workspace.scan` can use ripgrep (`src/ripgrep-directory-searcher.js`) or scandal (`DefaultDirectorySearcher`). The **product** switch is `find-and-replace.useRipgrep` (still defaults **false**). Architecture H1 flips that pin and then deletes the scandal searcher.

---

## Packages

- **Bundled / owned** — `packageDependencies` git pins on `builtbygio/*`. This is the catalog.
- **User-installed** — `~/.chevron/packages` via **cpm**. Not a product store. Community privileged `require` and native loads are **restricted by default**.
- **Not** `~/.atom/packages` unless the user set `ATOM_HOME`. **Not** apm Node 12.

Lifecycle: `activate` → optional services (`provide*` / `consume*`) → `deactivate`.  
Declare `engines.chevron`. Use `require('chevron')`. Long work: `BufferedProcess` or a main/`utilityProcess` host — **do not add new `Task` callers.**

Package manager: **cpm** (Electron-as-Node). `apm` is a name shim → cpm. See [cpm-design.md](./cpm-design.md) and [package-ecosystem-strategy.md](./package-ecosystem-strategy.md).

---

## IPC and “remote”

Classic Atom used `electron.remote`. Chevron removed that.

1. **`src/remote-compat.js`** — shrinking bridge for leftover package code  
2. **`renderer-ipc` / `application-delegate`** — preferred editor-facing APIs  
3. **`register-renderer-ipc.js`** — main-side allowlisted handlers  

New channels use the `chevron:` prefix and `invoke`. Existing `atom-*` channel names stay until a dedicated rename (they are the trust boundary).

| Realm | Node? | Role |
|-------|-------|------|
| Main | Yes | OS + IPC + host supervision |
| Editor preload | Yes | Chevron + owned packages + hot natives |
| Editor page | No | Shell DOM |
| Guest webview | No | Untrusted content |
| Git / LSP hosts | Yes, no DOM | `utilityProcess` |

See [remote-ipc-inventory.md](./remote-ipc-inventory.md), [security-threat-model.md](./security-threat-model.md).

---

## Build vs run

| Concern | What |
|---------|------|
| **Host toolchain** | Node 20–24 + Python 3.12 for bootstrap/build |
| **Package manager** | **cpm** (product Electron as Node). `apm` is a shim |
| **App runtime** | Electron **43.1.0** (in-process Node ~24) |
| **Package** | `script/build` → `out/Chevron.app` / `Chevron-linux-<arch>/chevron` / `chevron.exe` + `app.asar` |
| **Natives** | Rebuilt for Electron ABI; unpacked from asar |
| **Snapshot** | Custom on Linux/Windows; **stock on Darwin** |

```bash
nvm use
./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap
# macOS: open out/Chevron.app
# Linux: out/Chevron-linux-<arch>/chevron
```

See [build-modernization.md](./build-modernization.md), [packaging.md](./packaging.md).

---

## Mental model for debugging

1. **UI not updating / `chevron` missing in console** → you’re in page world; need isolated context.  
2. **Native crash / MODULE_VERSION** → ABI mismatch (host vs Electron rebuild).  
3. **Package throws on close** → lifecycle race in preload world, not main.  
4. **Shell / open external / dialogs** → main IPC, not raw Electron from packages.  
5. **Blank window on Mac** → often snapshot policy (`STOCK_V8_SNAPSHOT.txt`); Darwin custom pairs are a known boot crash.  
6. **No colour on `.c` / official grammars** → keep the whole tree-sitter module (`{name, language, nodeTypeInfo}`), do not unwrap to the raw Language.

---

## Design intent

Locked (do not re-litigate here):

- Keep the **hackable package platform** (`require('chevron')`, directory packages)
- Keep **Electron** and **Option C** (`sandbox: false`)
- **Chevron-only** — Atom surfaces are shims to delete, not a platform
- **Owned catalog** until package host v2
- **LSP + tree-sitter** where a grammar exists

What to change next is sequenced in [chevron-architecture-modernization.md](./chevron-architecture-modernization.md) (H1–H3). Do not treat this file as the modernization plan.

---

## Key source map

| Area | Paths |
|------|--------|
| Main entry | `src/main-process/main.js`, `start.js`, `atom-application.js`, `atom-window.js` |
| Preload boot | `static/preload.js`, `static/index.js` |
| Editor core | `src/atom-environment.js`, `src/workspace.js`, `src/project.js` |
| Editors | `src/text-editor.js`, `src/text-editor-component.js` |
| Packages | `src/package-manager.js`, `src/package.js`, `packages/*`, root `package.json` |
| IPC | `src/remote-compat.js`, `src/renderer-ipc.js`, `src/main-process/register-renderer-ipc.js` |
| LSP | `src/lsp/`, `src/main-process/workers/lsp-host.js` |
| Search | `src/ripgrep-directory-searcher.js`, `src/default-directory-searcher.js` |
| Build | `script/bootstrap-modern`, `script/build`, `script/lib/packaging-policy.js` |

---

## Companion docs

| Doc | Role |
|-----|------|
| [chevron-architecture-modernization.md](./chevron-architecture-modernization.md) | **Target** + PR plan (authoritative) |
| [atom-architecture-eli5.md](./atom-architecture-eli5.md) | Non-technical walkthrough |
| [REBRANDING.md](./REBRANDING.md) | Chevron-only surfaces |
| [package-ecosystem-strategy.md](./package-ecosystem-strategy.md) | Owned catalog; host v2 later |
| [lsp-design.md](./lsp-design.md) | Language-server architecture (shipped) |
