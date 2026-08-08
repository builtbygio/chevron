# `src/lsp` — Language Server Protocol (client infrastructure)

**Plan:** [docs/lsp-design.md](../../docs/lsp-design.md)

| Phase | Status | Contents |
|-------|--------|----------|
| **0** | **Done** | `framing.js` + tests; spike `script/lsp-phase0-spike.js` |
| **1** | **Done** | Host, trust, document sync, diagnostics, `packages/lsp-ui` status |
| **2** | **Done** | Hover, go-to-definition, `autocomplete.provider` v4 |
| **3** | **Done** | Multi-server registry, `chevron.lsp`, rust/python builtins, signature/references |
| **4** | **Done** | Rename, format, code actions, document symbols, WorkspaceEdit |
| **5** | **Done** | Optional cpm language-server packages — [lsp-server-distribution.md](../../docs/lsp-server-distribution.md) |

## Server resolution (precedence)

1. **Package** — `chevron.lsp.registerServer(...)` (e.g. `lsp-servers`, `chevron-lsp-rust`)
2. **User config** — `lsp.servers`
3. **Built-in** — PATH-only well-known servers

## Optional server install (Phase 5)

```bash
cpm install ./packages/chevron-lsp-rust
cpm install ./packages/chevron-lsp-typescript
cpm install ./packages/chevron-lsp-python
```

Not in the product installer (N1). Trust project after install.

## Commands

| Command | Default binding |
|---------|-----------------|
| `chevron-lsp:trust-project` | — |
| `chevron-lsp:status` | status-bar click |
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
