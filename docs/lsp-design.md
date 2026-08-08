# chevron-lsp — Language Server Protocol support (plan)

**Status:** **plan** (authoritative for implementation sequencing)  
**Date:** 2026-08-07 (promoted 2026-08-07)  
**Product version context:** post-0.6.0; multi-release milestone (0.7.x / 0.8.x)  
**Related:** [cpm-design.md](./cpm-design.md), [security-phase-s-package-host.md](./security-phase-s-package-host.md), [package-ecosystem-strategy.md](./package-ecosystem-strategy.md), [REBRANDING.md](./REBRANDING.md)  
**Precedent reused:** Phase S utilityProcess workers (`src/main-process/package-utility-worker.js`)  

**How to use this doc:** §5–6 process model and workspace trust are **locked**. §12 open decisions are **resolved** below (or deferred with a named phase). Implement phase-by-phase (§9); record landings in §14.
---

## 1. Purpose

Give Chevron **semantic language intelligence** — diagnostics, completion, hover,
go-to-definition, and later rename/format/code-actions — by speaking the
[Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
to external language servers.

Today Chevron ships **91 bundled packages and zero language servers**.
Completion is `autocomplete-plus` doing word/snippet matching (2015-era);
go-to-definition is `symbols-view` shelling out to **ctags**. That is the gap
between "text editor" and "code editor," and it is the single biggest blocker
to daily-driver use.

LSP is also, deliberately, a **systems problem**: long-lived child processes,
a framed JSON-RPC stream over stdio, request multiplexing and cancellation,
crash supervision, and a trust boundary around executing project-supplied
binaries. It is the right next milestone both for the product and for the
project's stated learning goals.

**Not in scope:** replacing tree-sitter (syntax stays local and fast; LSP adds
semantics on top), and rewriting the package API.

---

## 2. Goals and non-goals

### Goals

| ID | Goal |
|----|------|
| G1 | Run language servers **out of the renderer** — no new renderer Node surface (Phase S invariant) |
| G2 | Ship diagnostics, hover, go-to-definition, completion for at least one language end-to-end |
| G3 | Plug into existing service APIs where they exist (`autocomplete.provider`) rather than forking packages |
| G4 | **Workspace trust** gate: never auto-execute a project-specified server binary in an untrusted directory |
| G5 | Servers are **supervised**: lazy start, crash restart with backoff, idle shutdown, memory visible to the user |
| G6 | Owned-catalog packages can **register servers** and **replace the UI** via services — a seam that stays valid when package host v2 opens it to sandboxed community packages |
| G7 | Correct position mapping (UTF-16 ↔ UTF-8) — no off-by-one on non-ASCII files |
| G8 | Work on all five CI platforms (macOS x64/arm64, Linux x64/arm64, Windows) |

### Non-goals (v1–v2)

| ID | Non-goal |
|----|----------|
| N1 | Bundling language server binaries in the product installer (size, licensing, update cadence) |
| N2 | Debug Adapter Protocol (DAP) — a second protocol of comparable size; separate milestone |
| N3 | Replacing `symbols-view` / ctags for projects with no server configured |
| N4 | Notebook, inline-value, or call-hierarchy support in v1 |
| N5 | A VS Code–compatible extension API (`vscode.languages.*`) |
| N6 | Multi-root workspace semantics beyond Chevron's existing project-paths model |

### Locked constraints (inherited)

- **Chevron-only API policy** ([REBRANDING.md](./REBRANDING.md), #83): new surfaces use
  `global.chevron`, `require('chevron')`, and prefer `engines.chevron`.
  `global.atom` / `require('atom')` are unsupported legacy aliases — LSP code
  must not introduce new `atom`-named APIs. Default config home is **`~/.chevron`**.
- **Closed owned catalog** ([package-ecosystem-strategy.md](./package-ecosystem-strategy.md), #83):
  today's extension surface is owned packages (`builtbygio/*` + monorepo), **not**
  open community install. Sandboxed community packages arrive later with
  **package host v2**. LSP services are therefore designed as *forward-compatible
  seams*, consumed by owned packages now (§5.8).
- **Phase S invariant:** package/worker code does not get a Node `BrowserWindow`.
- **cpm is the installer** — any server distribution story routes through cpm, not a new mechanism.

---

## 3. Landscape

### 3.1 Atom — `atom-languageclient` + `atom-ide-ui`

**Model:** A base class (`AutoLanguageClient`) that each language package
subclasses; the package spawns its own server via `child_process` **from the
renderer**, and UI comes from `atom-ide-ui` (Facebook/Nuclide lineage).

| Aspect | Consequence |
|--------|-------------|
| Server spawned per-package, in renderer | N packages = N ad-hoc supervisors; renderer holds Node handles |
| `atom-ide-ui` provides diagnostics/hover/definition UI | Both `atom-ide-ui` and `atom-languageclient` are **unmaintained** since the sunset |
| Service-based (`linter`, `datatip`, `definitions`) | The *service shapes* survive in community memory — worth honouring |

**Lesson:** the service-oriented decomposition was right; the
spawn-from-renderer, one-supervisor-per-package architecture was not. Chevron
should centralize supervision and keep the service seams.

### 3.2 Pulsar

Maintains a revived `atom-languageclient` lineage and ships IDE-ish packages
community-side. Same renderer-spawn architecture as Atom.
**Lesson:** proves the ecosystem still wants this; not a template for process design.

### 3.3 VS Code

| Concern | VS Code |
|---------|---------|
| Where servers run | Extension host process (separate from renderer), servers are its children |
| Client library | `vscode-languageclient` over **`vscode-jsonrpc`** (framing, cancellation, progress) |
| UI | First-party: problems panel, hovers, peek definition, code actions |
| Trust | **Workspace Trust** — untrusted folders run in a restricted mode; servers/tasks gated |
| Distribution | Extensions bundle or download servers; platform-specific VSIX for binaries |

**Lesson:** the two decisions that matter are (a) servers live in a dedicated
process the renderer never touches, and (b) **executing project-configured
binaries is a trust decision, not a config decision**. Chevron should copy both.

### 3.4 What Chevron takes

| Source | Adopt | Avoid |
|--------|--------|--------|
| Atom | Service seams (`linter`-shaped diagnostics, definition/datatip providers) | Renderer-spawned servers; per-package supervisors |
| Pulsar | Ecosystem compatibility posture | Same architecture debt |
| VS Code | Dedicated host process, `vscode-jsonrpc`, workspace trust, platform binaries | Full extension-host API surface |

**Chosen strategy:** *one supervised LSP host in a utilityProcess*, exposing
**services** that owned-catalog packages consume today (and sandboxed community
packages consume after host v2) — the Phase S pattern applied to a second workload.

---

## 4. Current Chevron constraints

| Constraint | Impact on design |
|------------|------------------|
| No diagnostics UI bundled (`linter`/`atom-ide-ui` absent) | Diagnostics surface must be **built**, not consumed — biggest UI cost in v1 |
| `symbols-view` declares **no** provided/consumed services and is ctags-only | Go-to-definition cannot "plug in"; needs a new command/UI or a patched fork (§12.4) |
| `autocomplete-plus` exposes `autocomplete.provider` **v1.0–v4.0** | Completion **can** plug in with zero changes to autocomplete-plus — use v4.0 |
| Phase S: workers must be utilityProcess, `BrowserWindow` refused | LSP host follows `package-utility-worker.js` precedent exactly |
| 16 tree-sitter grammars, TextMate grammars elsewhere | Language identity for `languageId` must map from Atom scope names, not file extension alone |
| Electron 43 / Node 24 in-app | Modern `child_process`, `AbortSignal`, streams available in the host |
| Five-platform CI | Server discovery must handle Windows `.cmd`/`.exe` shims and PATH differences |
| Closed owned catalog (#83) | Server registration/UI-replacement seams have **owned** consumers today; they are built for host v2, not for an open ecosystem now |
| Unowned `atom/*` language packs are temporary SHA pins (#79) | Scope → `languageId` table must not hard-depend on those packages surviving |

---

## 5. Architecture

### 5.1 High-level

```text
┌─ Renderer (preload world) ──────────────────────────────────────┐
│  src/lsp/                                                        │
│   DocumentSync   — TextBuffer events → didOpen/didChange/didSave │
│   PositionMap    — Atom Point ↔ LSP Position (encoding-aware)    │
│   CapabilityMap  — server capabilities → enabled editor features │
│   Services       — provides: lsp.diagnostics, lsp.definitions,   │
│                    lsp.hover, autocomplete.provider (v4)         │
└───────────────────────────┬─────────────────────────────────────┘
                            │ ipcRenderer ⇄ main (typed messages)
┌─ Main process ────────────┴─────────────────────────────────────┐
│  src/main-process/lsp-worker-manager.js                          │
│   owns utilityProcess lifecycle, routing, restart policy         │
│   enforces workspace-trust gate before any spawn                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │ MessagePort / parentPort
┌─ utilityProcess: LSP host (pure Node, no DOM) ──────────────────┐
│  src/main-process/workers/lsp-host.js                            │
│   ServerSupervisor  — spawn, health, backoff, idle shutdown      │
│   JsonRpcConnection — Content-Length framing, ids, cancellation  │
│   per server: child_process(stdio) ⇄ rust-analyzer / tsserver …  │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 Process model (follows Phase S)

**Decision:** language servers are **grandchildren of the app** — spawned by a
dedicated `utilityProcess` host, never by the renderer.

Rationale:

1. **Phase S invariant.** Renderer/preload must not gain new Node process
   handles. `register-renderer-ipc.js` already refuses `BrowserWindow` workers.
2. **Crash isolation.** A wedged `rust-analyzer` (or a host bug) cannot take
   down the editor window; the manager restarts it.
3. **Precedent to copy.** `package-utility-worker.js` + `workers/git-utility-host.js`
   already implement synthetic-id routing, typed inbound/outbound messages,
   emergency env escape hatch, and CI integration tests. LSP is the second
   consumer — which is what proves that abstraction.
4. **Rehearsal for package host v2.** [security-phase-s-package-host.md](./security-phase-s-package-host.md)
   targets a **restricted host process for T2 package activation**, deferred
   until base Chevron is ready. LSP exercises the same shape — a supervised
   host owning untrusted-ish long-lived children, with a typed message
   boundary and lifecycle policy — on a workload where a crash is recoverable
   and the blast radius is one language. Lessons here (supervision, backoff,
   orphan reaping, resource accounting) transfer directly to host v2.

**One host, many servers** (not one host per server): a single supervisor keeps
restart policy, resource accounting, and shutdown ordering in one place.
Revisit only if a pathological server destabilizes the host (§12.6).

Message protocol mirrors the git host's shape:

```text
inbound:  { type: 'start-server' | 'request' | 'notify' | 'cancel' | 'stop-server' | 'shutdown', serverId, ... }
outbound: { type: 'server-ready' | 'response' | 'notification' | 'server-exit' | 'log', serverId, ... }
```

### 5.3 Transport and framing

LSP is JSON-RPC 2.0 with HTTP-style framing over stdio:

```text
Content-Length: 213\r\n
\r\n
{"jsonrpc":"2.0","id":1,"method":"textDocument/hover",...}
```

**Recommendation:** use **`vscode-jsonrpc`** (MIT, the reference implementation)
for the connection layer — it handles framing, request IDs, `$/cancelRequest`,
progress, and partial-result streaming, all of which are easy to get subtly wrong.

**Learning note (Phase 0):** hand-write the framing codec first as a throwaway
spike (~150 lines: a `Transform` stream that buffers until `Content-Length`
bytes are available, handles split/coalesced chunks, and rejects malformed
headers). Test it against a recorded server transcript. Then adopt
`vscode-jsonrpc` for production with a real understanding of what it does.
The spike is the single best way to internalize stream framing; shipping it is
not worth the maintenance.

### 5.4 Document sync and position encoding

**Sync mode:** incremental (`TextDocumentSyncKind.Incremental`). Atom's
`TextBuffer.onDidChange` yields `{oldRange, newRange, oldText, newText}` —
a near-direct map to `TextDocumentContentChangeEvent`. Version numbers
increment per change and **must** be monotonic per document.

**Position encoding — the classic bug source.** LSP historically defines
`Position.character` as an offset in **UTF-16 code units**; LSP 3.17 added
`general.positionEncoding` negotiation (`utf-8` / `utf-16` / `utf-32`).

| Side | Unit |
|------|------|
| Atom `Point.column` | JS string index = **UTF-16 code unit** |
| LSP default | **UTF-16 code unit** |
| `rust-analyzer`, some others | prefer **UTF-8** bytes when offered |

**Design:** advertise `positionEncoding: ['utf-16', 'utf-8']`, prefer utf-16
(zero conversion), and implement a tested converter for utf-8 servers.
Conversion lives in `src/lsp/position.js` with property-based tests over
astral-plane characters (emoji), combining marks, and CRLF line endings.
**Never** assume `column === byte offset`.

### 5.5 Server registry and discovery

Three sources, in precedence order:

1. **Package-registered** (via `chevron.lsp` service, §5.8) — owned catalog packages today.
2. **User config** — `~/.chevron/config.cson` → `lsp.servers`, keyed by Atom
   language scope:
   ```coffee
   lsp:
     servers:
       "source.ts":  { command: "typescript-language-server", args: ["--stdio"] }
       "source.rust": { command: "rust-analyzer" }
   ```
3. **Built-in table** — a small curated map of well-known servers, used only if
   the binary is already on `PATH`. Chevron **does not download servers** in v1 (N1).

**Project-local config is deliberately excluded from auto-execution** — see §6.

Language identity: map Atom **scope name** (`source.ts`) → LSP `languageId`
(`typescript`) with an explicit table, since scope names and languageIds do not
agree (`source.gfm` → `markdown`, `text.html.basic` → `html`).

**Windows:** resolve `command` through PATHEXT (`.cmd`/`.exe`/`.bat`); npm-installed
servers are `.cmd` shims that require `shell: false` + explicit extension, a
frequent cross-platform failure.

### 5.6 Capability → editor surface mapping

| LSP feature | Server capability | Chevron surface | v1? |
|-------------|-------------------|-----------------|-----|
| Diagnostics | `textDocument/publishDiagnostics` (push) | **New**: gutter markers + status count + panel | ✅ |
| Hover | `hoverProvider` | **New**: tooltip overlay | ✅ |
| Go to definition | `definitionProvider` | **New** command + `symbols-view`-style list (§12.4) | ✅ |
| Completion | `completionProvider` | `autocomplete-plus` **provider v4.0** (no fork) | ✅ |
| Signature help | `signatureHelpProvider` | Tooltip overlay | Phase 3 |
| References | `referencesProvider` | Results panel (reuse find-and-replace list styling) | Phase 3 |
| Rename | `renameProvider` | Modal + multi-file apply via workspace edit | Phase 4 |
| Formatting | `documentFormattingProvider` | Command + format-on-save config | Phase 4 |
| Code actions | `codeActionProvider` | Gutter lightbulb / context menu | Phase 4 |
| Document symbols | `documentSymbolProvider` | Supersede ctags in `symbols-view` when available | Phase 4 |
| Semantic tokens | `semanticTokensProvider` | Layer over tree-sitter highlighting | Later |

**Workspace edits** (rename, code actions) need a transactional multi-file
apply with undo grouping — a genuine correctness risk, hence Phase 4.

### 5.7 Completion integration (`autocomplete-plus`)

**LSP does not replace `autocomplete-plus`.** That package is the completion
*framework* — it provides `autocomplete.watchEditor`, decides when to trigger,
queries providers, merges/filters/renders the popup, and inserts the result
(expanding snippets via the `snippets` service). The *sources* are separate
packages (`autocomplete-css`, `-html`, `-snippets`, `-chevron-api`). **LSP
registers as one more source**, which is why completion needs zero forking.

```text
autocomplete-plus                ← framework (unchanged)
  ├── autocomplete-css/-html         ← static lists (fallback)
  ├── autocomplete-snippets          ← user snippets (LSP cannot know these)
  ├── autocomplete-chevron-api       ← editor API completions
  └── lsp completion provider        ← NEW: semantic, server-driven
```

#### 5.7.1 The ranking problem

`lib/provider-manager.js` merges providers by `inclusionPriority`,
`excludeLowerPriority`, and `suggestionPriority`; `lib/suggestion-list-element.js`
renders a fixed field set: `text`, `snippet`, `displayText`, `replacementPrefix`,
`type`, `leftLabel`, `rightLabel`, `characterMatchIndices`.

**There is no `sortText` field.** An LSP server's `sortText` ordering *is* the
semantic signal — "this is the most likely completion in this context" — and it
is most of what makes modern completion feel intelligent. If autocomplete-plus
re-sorts by its own fuzzy score, or interleaves word-based suggestions, that
ranking is destroyed and the result is barely better than today.

#### 5.7.2 Adapter requirements

| # | Requirement | Why |
|---|-------------|-----|
| 1 | Register with high `inclusionPriority` + **`excludeLowerPriority: true`** when a server is active for the scope | Suppresses static providers and preserves server order |
| 2 | Return suggestions **in server order**; do not locally re-sort | `sortText` is semantic, not alphabetical |
| 3 | Honour **`isIncomplete: true`** by re-querying on each keystroke instead of filtering locally | Local fuzzy filtering over an incomplete list hides valid results |
| 4 | Map `completionItem/resolve` → **`getSuggestionDetailsOnSelect`** | Lazy docs/detail; avoids resolving every item |
| 5 | Cancel in-flight requests on new input (`$/cancelRequest`) | Typing outruns the server; stale responses must not render |
| 6 | Carve out **snippets**: keep `autocomplete-snippets` visible even when excluding lower priority | User snippets are invisible to the server (LSP `InsertTextFormat.Snippet` ≠ your `snippets.cson`) |
| 7 | Translate `textEdit` ranges → `replacementPrefix` faithfully | Servers replace ranges that may extend behind the cursor |

#### 5.7.3 Open risk

Requirements 1–2 are a **priority trick**, not a real ranking contract: they
suppress competitors rather than teach the framework about server ordering. If
that proves lossy in practice — e.g. snippets must interleave *and* server
order must hold — the honest fix is a small patch to `autocomplete-plus`
(now an owned package under `builtbygio` pins) adding `sortText` passthrough.

**Do not assume this up front.** Phase 2 spikes the adapter with priorities
only, measures against a realistic TypeScript file, and patches upstream only
on evidence. Recorded as open decision §12.9.

### 5.8 Service APIs (seams for owned packages, and later host v2)

Provided by the LSP core package. Under the closed-catalog policy the consumers
today are **owned catalog packages**; the same surface becomes the community
extension point when **package host v2** lands:

| Service | Version | Purpose |
|---------|---------|---------|
| `chevron.lsp` | 1.0.0 | Register a server: `{ scopes, command, args, initializationOptions }` |
| `lsp.diagnostics` | 1.0.0 | Subscribe to normalized diagnostics (lets an alternative UI replace ours) |
| `lsp.definitions` | 1.0.0 | Query definitions programmatically |
| `lsp.hover` | 1.0.0 | Hover content (Atom-era shape: `datatip`) |

Consumed: `autocomplete.provider` (v4.0), `status-bar`.

**Why build seams for an ecosystem that is currently closed:** the services cost
little now (owned packages use them to stay decoupled from core), they keep the
reference UI genuinely replaceable rather than nominally so, and they are the
exact surface host v2 will need to expose across a process boundary. Designing
them now — while the only consumers are ours and mistakes are cheap to
change — is strictly easier than retrofitting them later.

### 5.9 Lifecycle and supervision

| Policy | v1 behaviour |
|--------|--------------|
| Start | **Lazy** — on first open of a file whose scope has a registered server, in a trusted project |
| Ready gate | Queue requests until `initialize`/`initialized` completes; never send before |
| Crash | Restart with exponential backoff (1s, 2s, 4s…), **max 3 in 5 min**, then surface a notification with the last stderr |
| Idle | Shut down after N minutes with no open documents of that language (default 10, configurable) |
| Shutdown | Graceful `shutdown` → `exit` → SIGTERM → SIGKILL ladder with timeouts, on window close and app quit |
| Orphans | Host tracks child PIDs; manager kills the tree if the host dies (reuse the git host's `tree-kill` approach) |
| Visibility | A `chevron-lsp: status` command listing servers, state, PID, uptime, restarts, RSS |

### 5.10 Libraries

| Concern | Choice |
|---------|--------|
| JSON-RPC + framing | `vscode-jsonrpc` (after the Phase 0 hand-rolled spike) |
| LSP type definitions | `vscode-languageserver-protocol` (types only; **not** `vscode-languageclient`, which assumes the VS Code API) |
| Process tree kill | reuse whatever the git host uses (`tree-kill`) |
| Path/PATHEXT resolution | `which` or a small internal resolver (Windows-aware) |

**Avoid:** `vscode-languageclient` (couples to `vscode.*` APIs), and any
dependency that assumes a VS Code workspace model.

---

## 6. Threat model and security

### 6.1 The core risk: opening a folder executes a binary

A language server is an **arbitrary executable with full user privileges** that
reads the entire project. Worse, several execute project content by design:
`tsserver` loads `tsconfig.json` plus **TypeScript plugins from `node_modules`**;
`rust-analyzer` can run `cargo` build scripts and procedural macros.

Therefore: **"clone a repo and open it in Chevron" must not equal "run code from
that repo."** This is precisely why VS Code shipped Workspace Trust.

### 6.2 Workspace trust (v1 requirement, G4)

| Rule | Behaviour |
|------|-----------|
| Untrusted project | **No servers start.** Editor is fully usable (tree-sitter syntax, ctags, search) with a dismissible "language features disabled" notice |
| Trust decision | Per project root, stored in `$CHEVRON_HOME/trusted-projects.json`; explicit user action |
| Inherited trust | Subdirectories of a trusted root are trusted; symlinks resolved before matching |
| Server source | Only §5.5 sources 1–3 (package/user/built-in). **Project-local `.chevron/lsp.json` is never auto-honoured** in v1 — if added later, it requires its own confirmation |
| Binary resolution | Prefer absolute paths / PATH lookup; **do not** prepend `./node_modules/.bin` for untrusted projects (that is project-controlled code) |
| Trust prompt copy | Must state plainly that language servers execute project build tooling |

### 6.3 Other controls

| Risk | Control |
|------|---------|
| Server reads secrets outside project | Servers get project roots as `workspaceFolders`; document that LSP does not sandbox filesystem access |
| Malicious server output | Treat all server strings as **untrusted data**: no HTML injection in hover (render markdown safely, no raw HTML), clamp diagnostic counts/sizes |
| Resource exhaustion | Idle shutdown, restart caps, RSS surfaced (§5.9); a `lsp.maxServers` cap |
| Command injection | Never build a shell string; `spawn(command, args, { shell: false })` always |
| Log leakage | Server stderr goes to a bounded in-memory ring + opt-in file log; never auto-upload |

### 6.4 Honest limitation

LSP support **does not** sandbox language servers. Trust is binary and
per-project. Per-server OS isolation (seatbelt/AppContainer/namespaces) is a
later platform milestone — adjacent to, but distinct from,
[package host v2](./security-phase-s-package-host.md), which isolates *package*
code rather than the external binaries a server spawns. Both should be stated
plainly in user docs — the same honesty standard as cpm-design §6.1.

---

## 7. Performance

| Concern | Approach |
|---------|----------|
| Startup cost | Lazy start (§5.9) — no server runs until a matching file opens; zero impact on editor cold start |
| Memory | `rust-analyzer` on a large workspace can exceed 1 GB — surface RSS, allow per-scope disable, idle shutdown |
| Request storms | Debounce `didChange` (default 150 ms), coalesce hover/completion, cancel in-flight requests on new keystrokes (`$/cancelRequest`) |
| Main-process load | Manager only routes; all parsing/IO in the host utilityProcess |
| Renderer jank | Diagnostics applied in batches on idle callbacks; never per-diagnostic DOM work |
| Large files | Skip sync above a size threshold (default 5 MB) with a visible notice |

---

## 8. Compatibility matrix

| Feature | Today (ctags/autocomplete-plus) | With LSP v1 | Notes |
|---------|--------------------------------|-------------|-------|
| Completion | Word + snippet | Semantic, server-driven | Falls back when no server |
| Go to definition | ctags (static, cross-language guesswork) | Exact, server-driven | ctags retained as fallback |
| Diagnostics | none | Push diagnostics | New UI |
| Hover docs | none | Markdown hover | New UI |
| Works offline | yes | yes | No network in v1 |
| Untrusted project | full function | **language features off** | Deliberate (§6.2) |
| Owned diagnostics UI | n/a | `packages/lsp-ui` (replaceable via `lsp.diagnostics`) | Closed catalog |
| Legacy `engines.atom` packages | n/a | unsupported product path | Chevron-only policy |

---

## 9. Implementation phases

### Phase 0 — Transport spike (no UI)

- Hand-roll the `Content-Length` framing codec; test against split/coalesced chunks and a recorded transcript.
- Drive one real server (`typescript-language-server --stdio`) from a plain Node script: `initialize` → `didOpen` → `hover` → `shutdown`.
- **Success:** a printed hover response, and notes on what `vscode-jsonrpc` handles that the spike does not.

### Phase 1 — Host + diagnostics (the architecture proof)

- `workers/lsp-host.js` + `lsp-worker-manager.js`, modelled on the git worker pair.
- `vscode-jsonrpc` connection, lifecycle/supervision (§5.9), workspace-trust gate (§6.2).
- Document sync + position mapping with tests.
- **Diagnostics UI**: gutter markers, status-bar count, list panel.
- One language (TypeScript), one platform-agnostic server.
- **Success:** editing a `.ts` file shows live errors; killing the server externally restarts it; untrusted project starts nothing; CI integration test green on all five platforms.

### Phase 2 — Hover, definition, completion

- Hover tooltip; go-to-definition command + result UI (§12.4 decision required).
- `autocomplete.provider` v4.0 adapter with cancellation.
- **Success:** the four v1 features work for TypeScript; completion latency measured and documented.

### Phase 3 — Multi-server + ecosystem

- `chevron.lsp` registration service; user-config servers; built-in table.
- Second and third languages (Rust via `rust-analyzer`, Python via `pyright`) as validation of the registry, including a **utf-8 positionEncoding** server.
- Signature help, references.
- **Success:** an owned-catalog package registers a server without touching core; the same call shape is what host v2 will expose to sandboxed packages.

### Phase 4 — Advanced edits

- Rename, code actions, formatting (+ format-on-save), document symbols into `symbols-view`.
- Transactional workspace edits with single-undo semantics.

### Phase 5 — Distribution (ties into cpm)

- Optional: language servers distributed as **cpm packages** with binary/npm prebuilds:
  `cpm install ./packages/chevron-lsp-rust` (etc.). See [lsp-server-distribution.md](./lsp-server-distribution.md).
- Keeps N1 intact (nothing bundled in the installer) while removing "install the server yourself" friction.

### Version framing

| Product | LSP |
|---------|-----|
| 0.6.x | none (today) |
| 0.7.x | Phase 0–1 (diagnostics, TypeScript) |
| 0.8.x | Phase 2–3 (four features, multi-server) |
| Later | Phase 4–5 |

---

## 10. Repository layout

```text
src/lsp/                              # renderer-side client (preload world)
  index.js                            # activation, service registration
  document-sync.js                    # TextBuffer → LSP notifications
  position.js                         # UTF-16 ↔ UTF-8 conversion (heavily tested)
  capability-map.js                   # server capabilities → enabled features
  language-id.js                      # Atom scope → LSP languageId table
  providers/
    autocomplete.js                   # autocomplete.provider v4.0 adapter
    diagnostics.js
    hover.js
    definitions.js
src/main-process/
  lsp-worker-manager.js               # mirrors package-utility-worker.js
  workers/lsp-host.js                 # utilityProcess entry (pure Node)
  lsp-trust.js                        # workspace trust store + prompts
packages/lsp-ui/                      # bundled reference UI (replaceable)
  lib/diagnostics-panel.js
  lib/hover-view.js
  styles/
script/ci/
  lsp-host-integration.test.js        # spawns a mock server; five-platform
  lsp-position.test.js                # property-based, unicode + CRLF
  lsp-trust.test.js                   # untrusted project spawns nothing
docs/lsp-design.md                    # this file
```

**Why this split:** core plumbing in `src/` (it is editor infrastructure, and
must not be uninstallable), reference UI in `packages/lsp-ui` (so it is
genuinely replaceable, not nominally so). Mirrors the cpm reasoning: ship the
mechanism in core, the policy/UI where it can be swapped.

---

## 11. Testing strategy

| Layer | Tests |
|-------|-------|
| Unit | Position conversion (property-based: emoji, combining marks, CRLF), language-id mapping, capability gating, backoff policy |
| Framing | Split chunks, coalesced messages, oversized headers, malformed `Content-Length`, UTF-8 multibyte across chunk boundaries |
| **Mock server fixture** | A deterministic fake server (`test/fixtures/mock-language-server.js`) that replays scripted responses — fast, offline, no toolchain needed. **The most valuable single test asset.** |
| Integration | Real `typescript-language-server` in CI: open → diagnostics → hover → definition |
| Supervision | Kill the server mid-request → restart; exceed restart cap → notification; idle → shutdown |
| Trust | Untrusted project spawns **zero** processes (assert on process table, not just UI) |
| Security | Hover markdown with `<script>` renders inert; no shell interpolation in spawn |
| Platform | Windows `.cmd` shim resolution; PATHEXT; path separators in URIs (`file:///C:/...`) |

**URI handling deserves its own tests:** `file://` URI ↔ path conversion is a
perennial cross-platform bug (drive letters, UNC paths, spaces, non-ASCII).

---

## 12. Decisions (locked at plan promotion)

| # | Topic | Resolution | Phase |
|---|--------|------------|-------|
| 1 | Framing library | Phase 0 **hand-rolled** codec for learning + tests; **production** uses **`vscode-jsonrpc`** after Phase 0 notes | 0 → 1 |
| 2 | Trust UX | **Passive** status-bar / notice: language features off until user trusts project (no modal on folder open) | 1 |
| 3 | Diagnostics UI | Bundled **`packages/lsp-ui`** (replaceable). **Chevron-native** diagnostics shape + `lsp.diagnostics` service — **not** Atom-era `linter` API | 1 |
| 4 | Go-to-definition | **New** results view in `lsp-ui` for v1; optional `symbols-view` service later | 2 |
| 5 | `positionEncoding` | **Always negotiate**; advertise `utf-16` + `utf-8`; prefer utf-16 | 1–3 |
| 6 | Host topology | **One** utilityProcess host, many servers (revisit only if a server wedges the host) | 1 |
| 7 | Built-in server table | Ship a small table; use only if binary is **already on PATH** | 1–3 |
| 8 | Server distribution | v1 user/PATH/package-registered only; **cpm prebuilds optional Phase 5** | 5 |
| 9 | Completion ranking | Phase 2: priority-trick first; **patch owned `autocomplete-plus` only if measured** | 2 |

### Implementation order (execute in order)

| Step | Work | Exit criteria |
|------|------|----------------|
| **Phase 0** | Framing codec + unit tests; optional real-server spike script | Codec tests green; spike can print hover if `typescript-language-server` on PATH |
| **Phase 1** | `lsp-worker-manager` + `lsp-host` utilityProcess; trust gate; document sync; diagnostics UI; TypeScript | Live errors on `.ts`; crash restart; untrusted ⇒ 0 processes; CI |
| **Phase 2** | Hover, definition, completion adapter | Four v1 features for TS |
| **Phase 3** | `chevron.lsp` registry; multi-server; signature/references | Owned package registers a server without core edits |
| **Phase 4** | Rename, format, code actions, symbols | Workspace edits with undo grouping |
| **Phase 5** | Optional cpm server prebuilds | Documented install path for binaries |

Do **not** start Phase 1 until Phase 0 exit criteria pass.

---

## 13. Success criteria (definition of done for "Chevron has LSP")

- [ ] Zero language-server processes spawned from the renderer (Phase S invariant intact).
- [x] TypeScript: diagnostics, hover, definition, completion working on all five CI platforms. *(Phase 1–2; CI unit + platform smoke)*
- [x] Untrusted project: **no** server process starts; editor remains fully usable. *(Phase 1 trust gate)*
- [ ] Server crash recovers automatically; restart storm is capped and surfaced. *(backoff partial; full storm cap later)*
- [x] Position mapping correct for emoji/combining-mark/CRLF fixtures, utf-16 **and** utf-8 servers. *(Phase 3 encoding path + unit tests)*
- [x] An owned-catalog package registers a server via `chevron.lsp` with no core changes. *(packages/lsp-servers)*
- [ ] Diagnostics UI replaceable via `lsp.diagnostics` (proven by swapping in a second UI, even a stub).
- [ ] Editor cold-start time unchanged (lazy start verified by measurement).
- [ ] Docs state plainly that servers are unsandboxed and trust is per-project.

---

## 14. Document history

| Date | Change |
|------|--------|
| 2026-08-07 | Initial design: process model (utilityProcess host), transport, trust gate, capability mapping, phases |
| 2026-08-07 | Rebased on #83 (Chevron-only API policy + closed owned catalog): constraints, service framing, success criteria. Added §5.7 completion integration (`autocomplete-plus` has no `sortText`) and §12.9. Noted LSP host as a rehearsal for package host v2 (§5.2.4). |
| 2026-08-07 | **Promoted to plan.** §12 decisions locked; implementation order fixed. |
| 2026-08-07 | **Phase 0 landed:** `src/lsp/framing.js` + `script/ci/lsp-framing.test.js`; optional spike `script/lsp-phase0-spike.js` (typescript-language-server hover). Ready for Phase 1. |
| 2026-08-07 | **Phase 1 landed (MVP):** utilityProcess `lsp-host` + manager, workspace trust, document sync, TypeScript built-in when trusted, `packages/lsp-ui` status + trust nudge, CI tests. |
| 2026-08-08 | **Phase 2 landed:** hover tooltip + `chevron-lsp:show-hover`; go-to-definition (`F12`) + multi-result list in `lsp-ui`; `autocomplete.provider` v4 adapter (priority-trick ranking, generation cancel, resolve on select); completion latency stats on `chevron-lsp:status`. |
| 2026-08-08 | **Phase 3 landed:** `chevron.lsp` registry (package > user config > builtin); multi-server sessions; rust-analyzer + pyright builtins; owned package `lsp-servers` registers via service; `positionEncoding` negotiation (utf-8 path); signature help + find references. |
| 2026-08-08 | **Phase 4 landed:** WorkspaceEdit apply (per-buffer transact + checkpoint rollback); rename (F2); format document/selection + `lsp.formatOnSave`; code actions; document symbols; server `workspace/applyEdit` handling. |
| 2026-08-08 | **Phase 5 landed:** cpm language-server prebuilds (`cpm/lib/language-server-prebuild.js`); optional packages `chevron-lsp-rust` / `-typescript` / `-python`; install docs. N1 preserved (not in packageDependencies). |

---

## 15. Summary

Chevron gets language intelligence by running servers in a **supervised
utilityProcess host** — the Phase S pattern's second consumer — talking framed
JSON-RPC over stdio, surfacing results through **services** that packages can
consume or replace.

Two decisions carry the design: **servers never touch the renderer** (keeps the
security work of Phase S intact), and **executing a project's toolchain is a
trust decision** (workspace trust before any spawn). The first is architecture;
the second is the difference between a code editor and a remote code execution
vector.

Atom proved the service seams were right and the renderer-spawn model was
wrong. VS Code proved a dedicated host plus workspace trust is the answer.
Chevron takes both, ships a reference UI behind replaceable seams,
and — per the project's own standard — says plainly what it does **not**
protect against.
