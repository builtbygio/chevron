# How Chevron works (architecture)

**Audience:** developers studying or modifying the editor  
**Product:** Chevron — a modernized fork of Atom  
**Runtime:** Electron 45.2.2 (Chromium 156, Node 24 in-app)  
**Current-state sketch.** The **target** (what to delete, wrap, or migrate next) is [chevron-architecture-modernization.md](./chevron-architecture-modernization.md). If this file disagrees with that one on intent, the modernization doc wins. If it disagrees on the running version, this file and `package.json` `electronVersion` win.

Chevron is a **hackable Electron 45 editor**. The package *model* (`activate` / services / keymaps / styles, `require('chevron')`, inspectable preload) stays. Atom-era *machinery* (CSON-as-config, `Task` fork workers, scandal search, TextMate as the default language engine, Jasmine-as-hero) does not. User config is JSON; packager is `@electron/packager`.

---

## One-sentence model

**Main** owns OS, IPC, and supervised hosts.  
**Editor preload** owns the hackable UI + hot-path natives (Phase S **Option C**: Chromium `sandbox: false`).  
**Semantics** live in the LSP `utilityProcess`.  
**Syntax** is tree-sitter in-process. A language with no grammar opens uncoloured.  
**Packages** are Chevron services in the preload world (owned catalog).  
The **page world** is a thin shell without Node.

---

## High-level stack

```text
┌─────────────────────────────────────────────────────────────┐
│  Electron 45.2.2  (Chromium 156 + Node 24 in-app)           │
├─────────────────────────────────────────────────────────────┤
│  Main process (T0)                                          │
│  src/main-process/main.js → start.js → ChevronApplication   │
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
- Create `ChevronApplication` / `ChevronWindow` (BrowserWindows)
- App menus, dialogs, `shell.openExternal`, protocol handlers (`chevron://`; `atom://` is a shim)
- **IPC hub** (`register-renderer-ipc.js`, `register-fs-ipc.js`) — allowlisted only
- Supervise **git** and **LSP** `utilityProcess` hosts

This is the only place that should talk freely to the OS for sensitive work. Find-in-project `rg` is an allowlisted main-process spawn (`chevron:rg-search-start`).

### 2. Editor window (renderer)

Created in `chevron-window.js` with roughly:

| Preference | Value | Meaning |
|------------|--------|---------|
| `nodeIntegration` | `false` | Page JS cannot use Node |
| `contextIsolation` | `true` | Preload and page are separate JS worlds |
| `preload` | `static/preload.js` | Boots the editor |
| `sandbox` | `false` | **Intentional** (Option C). Preload loads superstring / tree-sitter / pathwatcher. Do not flip this as “modernization.” |

`global.chevron` (`ChevronEnvironment`) lives in the **Electron Isolated Context** (preload), not the page. CDP debugging must target that context. There is no `global.atom`. `require('atom')` fails with `MODULE_NOT_FOUND`.

### 3. Guests and workers

- **Guest `<webview>`s:** no Node; sandboxed prefs forced on attach.
- **Git:** `utilityProcess` (`package-utility-worker.js`). Node BrowserWindow workers are gone.
- **LSP:** `utilityProcess` (`src/main-process/workers/lsp-host.js`).
- **`Task`:** **deleted** (Wave 3). It was a renderer `child_process.fork` + fake DOM; `src/task.ts`, `task-bootstrap.js` and the public export are gone, after a grep proved zero callers across all 94 owned pins. Long work belongs in a `utilityProcess` host.

See [security-phase-s-decision.md](../decisions/security-phase-s-decision.md).

---

## Boot sequence (editor window)

```text
1. Main creates BrowserWindow + loads static HTML
2. static/preload.js runs in isolated world with Node
3. static/index.js sets up remote-compat (no electron.remote)
4. initialize-application-window.js builds ChevronEnvironment
   (installs global.chevron; there is no global.atom)
5. chevron.packages loads themes + owned packages
6. Workspace UI mounts: panes, docks, editors, status bar
7. Optional: welcome tabs, project paths from CLI, restore state
```

Linux and macOS ship Electron’s stock V8 snapshots. Linux skips a custom one because spell-check fails in about half of smoke runs; macOS skips because a valid pair still leaves the renderer empty. Windows still attempts one. `CHEVRON_FORCE_MKSNAPSHOT=1` retries a skip. Construction of `ChevronEnvironment` is always runtime. See [packaging.md](./packaging.md).

---

## Core runtime objects (`require('chevron')`)

Packages and core talk through **`global.chevron`** (`ChevronEnvironment` in `src/chevron-environment.js`):

| Object | Role |
|--------|------|
| `chevron.workspace` | Center + docks, open items, panes, panels, find-in-project |
| `chevron.project` | Roots, buffers, path watching |
| `chevron.packages` | Activate/deactivate packages |
| `chevron.commands` | Keymap-bound commands |
| `chevron.config` | Settings. JSON only (`config.json`, `keymap.json`, `snippets.json`). A leftover `.cson` is reported and not read |
| `chevron.grammars` | tree-sitter 0.25 only. A language with no grammar is plain uncoloured text |
| `chevron.styles` / `chevron.themes` | LESS/CSS UI & syntax themes |
| `chevron.notifications` | Toasts / errors |

`require('atom')` is `MODULE_NOT_FOUND`. The `exports/atom.js` alias is gone.

### Workspace layout

```text
chevron-workspace
├── center (WorkspaceCenter) — editors, welcome, settings, etc.
│   └── panes (split tabs)
├── left dock  — e.g. tree-view “Project”
├── right dock — e.g. github / git tabs
└── bottom dock — e.g. find results
```

**Items** are model objects (TextEditor, GuideView, …) with optional `getTitle` / `getURI` / `destroy`.  
**Views** are DOM elements registered via `ViewRegistry`. Core tags are `chevron-*` (`chevron-text-editor`, `chevron-pane`, `chevron-pane-resize-handle`, and the panel, overlay, and styles tags). `atom-select-list` is still that package. The keymap engine lives in `src/keymap`; the `atom-keymap` package is gone. The custom elements polyfill is `@webcomponents/custom-elements` (`static/index.js`): `window.customElements` is null in the preload world. A constructor must not set attributes. See [custom-elements.md](./custom-elements.md).

### Text editing stack

```text
TextBuffer (text-buffer package)
    └── TextEditor (model)
            └── TextEditorComponent (DOM / layers / decorations)
                    └── markers + decorations (git-diff gutters, etc.)
```

Language: official **tree-sitter 0.25**. Every shipped grammar is `type: tree-sitter`. A language with no tree-sitter grammar opens uncoloured. TextMate, first-mate, and oniguruma are gone. See [language-stack.md](./language-stack.md).

Find-in-project: `Workspace.scan` is **ripgrep only**, spawned from main (`chevron:rg-search-start`). Packages may still provide `atom.directory-searcher` for a given directory. `CHEVRON_SEARCH_ENGINE=scandal` is ignored. The product UI is `find-and-replace`, which no longer carries a `useRipgrep` setting: there is one engine, so there was nothing to choose.

User config, keymaps, and snippets are **JSON** (`config.json`, `keymap.json`, `snippets.json`). A leftover `.cson` is reported and left on disk; it is not read and not deleted. `CHEVRON_CONFIG_CSON` is gone. `season` is gone; readers are JSON-only.

---

## Packages

- **Bundled / owned** — `packageDependencies` git pins on `builtbygio/*`. This is the catalog.
- **User-installed** — `~/.chevron/packages` via **cpm**. Not a product store. Community privileged `require` and native loads are **restricted by default**.
- **Not** `~/.atom/packages` unless the user set `ATOM_HOME`. **Not** apm — that name is retired, not aliased.

Lifecycle: `activate` → optional services (`provide*` / `consume*`) → `deactivate`.  
Declare `engines.chevron`. Use `require('chevron')`. Long work: `BufferedProcess` or a main/`utilityProcess` host — **`Task` no longer exists.**

Package manager: **cpm** (Electron-as-Node). The `apm` name is **retired** — nothing installs it. See [cpm-design.md](./cpm-design.md) and [package-ecosystem-strategy.md](../decisions/package-ecosystem-strategy.md).

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
| **Package manager** | **cpm** (product Electron as Node). The `apm` name is retired |
| **App runtime** | Electron **45.2.2** (in-process Node 24) |
| **Package** | `script/build` → `out/Chevron.app` / `Chevron-linux-<arch>/chevron` / `chevron.exe` + `app.asar` |
| **Natives** | Rebuilt for Electron ABI; unpacked from asar |
| **Snapshot** | Stock on Linux and macOS; Windows still generates one |

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
- **LSP + tree-sitter** (one highlighter)

What to change next is sequenced in [chevron-architecture-modernization.md](./chevron-architecture-modernization.md) (H1–H3). Do not treat this file as the modernization plan.

---

## Key source map

| Area | Paths |
|------|--------|
| Main entry | `src/main-process/main.js`, `start.js`, `chevron-application.js`, `chevron-window.js` |
| Preload boot | `static/preload.js`, `static/index.js` |
| Editor core | `src/chevron-environment.js`, `src/workspace.js`, `src/project.js` |
| Editors | `src/text-editor.js`, `src/text-editor-component.js` |
| Packages | `src/package-manager.js`, `src/package.js`, `packages/*`, root `package.json` |
| IPC | `src/remote-compat.js`, `src/renderer-ipc.js`, `src/main-process/register-renderer-ipc.js` |
| LSP | `src/lsp/`, `src/main-process/workers/lsp-host.js` |
| Search | `src/ripgrep-directory-searcher.js` |
| Build | `script/bootstrap-modern`, `script/build`, `script/lib/packaging-policy.js` |

---

## Companion docs

| Doc | Role |
|-----|------|
| [chevron-architecture-modernization.md](./chevron-architecture-modernization.md) | **Target** + PR plan (authoritative) |
| [atom-architecture-eli5.md](../orientation/atom-architecture-eli5.md) | Non-technical walkthrough |
| [REBRANDING.md](../decisions/REBRANDING.md) | Chevron-only surfaces |
| [package-ecosystem-strategy.md](../decisions/package-ecosystem-strategy.md) | Owned catalog; host v2 later |
| [lsp-design.md](./lsp-design.md) | Language-server architecture (shipped) |
