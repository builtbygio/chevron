# `src/lsp` — Language Server Protocol (client infrastructure)

**Plan:** [docs/lsp-design.md](../../docs/lsp-design.md)

| Phase | Status | Contents |
|-------|--------|----------|
| **0** | **Done** | `framing.js` + tests; spike `script/lsp-phase0-spike.js` |
| **1** | **Done** | Host `workers/lsp-host.js`, `lsp-worker-manager.js`, trust, document sync, diagnostics events, `packages/lsp-ui` status |
| **2** | **Done** | Hover, go-to-definition, `autocomplete.provider` v4 adapter (`providers/*`); UI in `packages/lsp-ui` |
| 3+ | Not started | Multi-server registry, signature help, references |

Host still uses the Phase 0 framing codec; may adopt `vscode-jsonrpc` later without changing the process model.

## Commands (via `lsp-ui` menus / keymaps)

| Command | Default binding |
|---------|-----------------|
| `chevron-lsp:trust-project` | — |
| `chevron-lsp:status` | status-bar click |
| `chevron-lsp:go-to-definition` | `F12` |
| `chevron-lsp:show-hover` | `Alt-F1` |

## Completion ranking (Phase 2)

Priority-trick only (`inclusionPriority: 1`, `excludeLowerPriority: true`, `suggestionPriority: 5`) so subsequence words drop out while snippets stay. Server order preserved; no `sortText` patch to autocomplete-plus yet. Latency samples appear on `chevron-lsp:status`.
