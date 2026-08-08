# `src/lsp` — Language Server Protocol (client infrastructure)

**Plan:** [docs/lsp-design.md](../../docs/lsp-design.md)

| Phase | Status | Contents |
|-------|--------|----------|
| **0** | **Done** | `framing.js` + tests; spike `script/lsp-phase0-spike.js` |
| **1** | **Done** | Host `workers/lsp-host.js`, trust, document sync, diagnostics, `packages/lsp-ui` status |
| **2** | **Done** | Hover, go-to-definition, `autocomplete.provider` v4 |
| **3** | **Done** | Multi-server registry (`registry.js`), `chevron.lsp` service, rust/python builtins + `packages/lsp-servers`, signature help, references, `positionEncoding` |
| 4+ | Not started | Rename, format, code actions, workspace edits |

## Server resolution (precedence)

1. **Package** — `chevron.lsp.registerServer({ id, scopes, command, args })` (e.g. `packages/lsp-servers`)
2. **User config** — `lsp.servers` in config (`source.rust`: `{ command: "rust-analyzer" }`)
3. **Built-in** — typescript-language-server, rust-analyzer, pyright when on PATH

## Commands

| Command | Default binding |
|---------|-----------------|
| `chevron-lsp:trust-project` | — |
| `chevron-lsp:status` | status-bar click |
| `chevron-lsp:go-to-definition` | `F12` |
| `chevron-lsp:find-references` | `Shift-F12` |
| `chevron-lsp:show-hover` | `Alt-F1` |
| `chevron-lsp:signature-help` | `Ctrl-Shift-Space` |
