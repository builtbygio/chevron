# chevron-lsp-markdown

Markdown and plain text support for [Chevron](https://github.com/builtbygio/chevron), through the
Language Server Protocol: completions, diagnostics, hovers, go-to-definition and
rename, wherever the server supports them.

This package is part of Chevron's owned catalog. It is **not bundled** with the
app -- it is installed on demand so the editor does not carry a language server
for every language nobody asked for.

## Installing

Settings → **Install**, then the button beside *Prose language server*. Or from a checkout:

```
cpm install ./packages/chevron-lsp-markdown
```

The owned catalog is not published to npm, so a path is required rather than a
name. Reload the window after installing to activate the package.

## The server

[harper-ls](https://github.com/Automattic/harper) v2.9.1, run as
`harper-ls --stdio`.

Harper checks grammar, spelling and style **entirely offline** -- nothing is
sent anywhere. It is a downloaded prebuild rather than an npm dependency;
prebuilds are published for linux-x64, linux-arm64, darwin-x64, darwin-arm64
and win32-x64.

This is the one package here that attaches to plain text as well as Markdown,
so it applies to notes and commit messages, not just documentation.

## Scopes

Registered for:

- `source.gfm`
- `text.plain`
- `text.plain.null-grammar`

## How it attaches

The package consumes the `chevron.lsp` service and registers `harper-ls` for the
scopes above. Open a matching file and the server starts; the LSP indicator in
the status bar shows when it is running. If no server is registered for a
scope, Chevron says so and points at the package that provides it.

## Licence

MIT. The language server it runs carries its own licence.
