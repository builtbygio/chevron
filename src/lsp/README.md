# `src/lsp` — Language Server Protocol (client infrastructure)

**Plan:** [docs/lsp-design.md](../../docs/lsp-design.md)

| Phase | Status | Contents |
|-------|--------|----------|
| **0** | **Done** | `framing.js` + tests; spike `script/lsp-phase0-spike.js` |
| **1** | **Done** | Host, trust, document sync, diagnostics, `packages/lsp-ui` status |
| **2** | **Done** | Hover, go-to-definition, `autocomplete.provider` v4 |
| **3** | **Done** | Multi-server registry, `chevron.lsp`, rust/python builtins, signature/references |
| **4** | See PR | Rename, format, code actions, symbols (if not yet on master) |
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
| `chevron-lsp:show-hover` | `Alt-F1` |
| `chevron-lsp:signature-help` | `Ctrl-Shift-Space` |
