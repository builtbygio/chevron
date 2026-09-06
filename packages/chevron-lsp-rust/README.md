# chevron-lsp-rust

Rust support for [Chevron](https://github.com/builtbygio/chevron), through the
Language Server Protocol: completions, diagnostics, hovers, go-to-definition and
rename, wherever the server supports them.

This package is part of Chevron's owned catalog. It is **not bundled** with the
app -- it is installed on demand so the editor does not carry a language server
for every language nobody asked for.

## Installing

Settings → **Install**, then the button beside *Rust language server*. Or from a checkout:

```
cpm install ./packages/chevron-lsp-rust
```

The owned catalog is not published to npm, so a path is required rather than a
name. Reload the window after installing to activate the package.

## The server

[rust-analyzer](https://rust-analyzer.github.io/) 2025-01-20, a downloaded prebuild
rather than an npm dependency. Prebuilds are published for linux-x64,
linux-arm64, darwin-x64, darwin-arm64 and win32-x64.

rust-analyzer works from `Cargo.toml`, so open the **crate or workspace root**
as your project folder. Opening a single `.rs` file outside a cargo project
gives you syntax help and little else. The first index of a large workspace
takes a while; the status bar shows the server as running throughout.

## Scopes

Registered for:

- `source.rust`

## How it attaches

The package consumes the `chevron.lsp` service and registers `rust-analyzer` for the
scopes above. Open a matching file and the server starts; the LSP indicator in
the status bar shows when it is running. If no server is registered for a
scope, Chevron says so and points at the package that provides it.

## Licence

MIT. The language server it runs carries its own licence.
