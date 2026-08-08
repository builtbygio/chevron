# `src/lsp` — Language Server Protocol (client infrastructure)

**Design:** [docs/lsp-design.md](../../docs/lsp-design.md) (implemented)  
**Server install:** [docs/lsp-server-distribution.md](../../docs/lsp-server-distribution.md)

| Phase | Status | Contents |
|-------|--------|----------|
| **0** | **Done** | Framing codec + tests; optional spike |
| **1** | **Done** | Host, trust, document sync, diagnostics |
| **2** | **Done** | Hover, go-to-definition, completion |
| **3** | **Done** | Multi-server registry, signature help, references |
| **4** | **Done** | Rename, format, code actions, symbols, WorkspaceEdit |
| **5** | **Done** | Optional cpm language-server packages |
| **Goals** | **Done** | G5 supervision; G6 `lsp.diagnostics` + stub UI |

## Architecture (short)

- **Renderer:** `src/lsp` — sync, providers, registry, services  
- **Main:** trust gate + `lsp-worker-manager`  
- **Host:** `utilityProcess` `workers/lsp-host.js` — spawn servers, restart/backoff/idle  
- **UI:** `packages/lsp-ui` (reference); `packages/lsp-diagnostics-stub` proves replaceable diagnostics  

Servers never spawn in the renderer. Language servers are **unsandboxed**; they only start for **trusted** project roots.

## Server resolution (precedence)

1. **Package** — `chevron.lsp.registerServer(...)` (`lsp-servers`, `chevron-lsp-*`)  
2. **User config** — `lsp.servers`  
3. **Built-in** — PATH-only well-known servers  

## Optional server install (Phase 5)

```bash
cpm install ./packages/chevron-lsp-rust
cpm install ./packages/chevron-lsp-typescript
cpm install ./packages/chevron-lsp-python
```

Not in the product installer (N1). Trust the project after install.

## Services

| Service | Version | Provider |
|---------|---------|----------|
| `chevron.lsp` | 1.0.0 | `lsp-ui` → core registry |
| `lsp.diagnostics` | 1.0.0 | `lsp-ui` → core diagnostics map |
| `autocomplete.provider` | 4.0.0 | `lsp-ui` → LSP completion adapter |

## Commands

| Command | Default binding |
|---------|-----------------|
| `chevron-lsp:trust-project` | — |
| `chevron-lsp:status` | status-bar click |
| `chevron-lsp:toggle-diagnostics` | `Ctrl-Shift-M` (or Ctrl/Cmd-click status) |
| `chevron-lsp:go-to-definition` | `F12` |
| `chevron-lsp:find-references` | `Shift-F12` |
| `chevron-lsp:rename` | `F2` |
| `chevron-lsp:format-document` | `Ctrl-Shift-I` |
| `chevron-lsp:code-actions` | `Ctrl-.` |
| `chevron-lsp:document-symbols` | `Ctrl-Shift-O` |
| `chevron-lsp:show-hover` | `Alt-F1` |
| `chevron-lsp:signature-help` | `Ctrl-Shift-Space` |

## Config

| Key | Default | Meaning |
|-----|---------|---------|
| `lsp.servers` | `{}` | User server map |
| `lsp.formatOnSave` | `false` | Format via LSP before save |

## Tests

```bash
node --test script/ci/lsp-*.test.js
```
