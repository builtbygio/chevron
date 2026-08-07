# `src/lsp` — Language Server Protocol (client infrastructure)

**Plan:** [docs/lsp-design.md](../../docs/lsp-design.md)

| Phase | Status | Contents |
|-------|--------|----------|
| **0** | **In progress / landed** | `framing.js` — Content-Length codec (learning + tests). Spike: `script/lsp-phase0-spike.js` |
| 1+ | Not started | Host utilityProcess, trust, document sync, UI, providers |

Production Phase 1 may switch the connection layer to `vscode-jsonrpc` per the plan; framing tests stay valuable either way.
