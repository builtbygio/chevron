# `src/lsp` — Language Server Protocol (client infrastructure)

**Plan:** [docs/lsp-design.md](../../docs/lsp-design.md)

| Phase | Status | Contents |
|-------|--------|----------|
| **0** | **Done** | `framing.js` + tests; spike `script/lsp-phase0-spike.js` |
| **1** | **In progress** | Host `workers/lsp-host.js`, `lsp-worker-manager.js`, trust, document sync, `packages/lsp-ui` diagnostics status |
| 2+ | Not started | Hover, definition, completion adapter, multi-server |

Host still uses the Phase 0 framing codec; may adopt `vscode-jsonrpc` later without changing the process model.
