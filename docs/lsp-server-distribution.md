# Language server distribution (LSP Phase 5)

Chevron does **not** ship language-server binaries in the product installer
([N1](./lsp-design.md)). Phases 1–4 only start a server when:

1. The project is **trusted**, and  
2. A command is available (PATH, user config, package registration, or built-in table).

Phase 5 adds an **optional** install path via **cpm**, so users can pull a
pinned server without installing it globally.

## Install (from a Chevron checkout)

```bash
# Rust (downloads rust-analyzer prebuild for your platform)
cpm install ./packages/chevron-lsp-rust

# TypeScript (npm deps: typescript + typescript-language-server)
cpm install ./packages/chevron-lsp-typescript

# Python / Pyright (npm dep: pyright)
cpm install ./packages/chevron-lsp-python
```

Packages land in `$CHEVRON_HOME/packages/` (default `~/.chevron/packages/`).
Restart Chevron (or reload packages). Trust the project, then open a matching file.

PATH fallback still works: if the prebuild/npm binary is missing, the package
registers the short command name and `builtin-servers` / PATH may still find it.

**If nothing happens when you open a `.ts` / `.rs` / `.py` file:** there is
no server binary (install one of the packages above, or put the server on
`PATH`) **and** the project is not trusted. Command palette →
`Chevron Lsp: Status` shows registrations and trusted roots.
`Chevron Lsp: Trust Project` is required before any server starts.

## What cpm does

| Package | How the binary arrives |
|---------|------------------------|
| `chevron-lsp-rust` | `chevron.languageServer.prebuilds` URL → gunzip into `bin/rust-analyzer` |
| `chevron-lsp-typescript` | `dependencies` + arborist → `node_modules/.bin/typescript-language-server` |
| `chevron-lsp-python` | `dependencies` + arborist → `node_modules/.bin/pyright-langserver` |

After extract + deps, cpm runs `ensureLanguageServerBinary` for packages that
declare `chevron.languageServer` (see `cpm/lib/language-server-prebuild.js`).

## Package metadata shape

```json
{
  "name": "chevron-lsp-example",
  "chevron": {
    "languageServer": {
      "id": "example",
      "scopes": ["source.example"],
      "command": "bin/example-ls",
      "args": ["--stdio"],
      "tag": "1.0.0",
      "prebuilds": {
        "linux-x64": "https://example.com/releases/{tag}/example-linux-x64.gz",
        "darwin-arm64": "https://example.com/releases/{tag}/example-darwin-arm64.gz"
      }
    }
  },
  "consumedServices": {
    "chevron.lsp": {
      "versions": { "1.0.0": "consumeLsp" }
    }
  }
}
```

URL templates: `{tag}` `{name}` `{version}` `{platform}` `{arch}` `{target}` `{key}`.

On activate, the package calls `chevron.lsp.registerServer` with an **absolute**
command path when the binary exists (package registration wins over built-ins).

## Security / trust

- Installing a language-server package only puts a binary on disk under package home.
- Chevron still will **not** spawn it for an **untrusted** project.
- Language servers remain **unsandboxed** full-privilege processes (see threat model in [lsp-design.md](./lsp-design.md) §6).

## Not bundled

These packages are **not** in root `packageDependencies`. The default app install
stays small. Users who want Rust/TS/Python intelligence opt in via cpm.

## Related

- [lsp-design.md](./lsp-design.md) §5.5, Phase 5  
- [cpm-prebuilds.md](./cpm-prebuilds.md) (native `.node` prebuilds — related but separate)  
- `packages/lsp-servers` — PATH-based multi-register helper (Phase 3)
