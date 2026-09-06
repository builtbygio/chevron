# chevron-lsp-json

JSON support for [Chevron](https://github.com/builtbygio/chevron), through the
Language Server Protocol: completions, diagnostics, hovers, go-to-definition and
rename, wherever the server supports them.

This package is part of Chevron's owned catalog. It is **not bundled** with the
app -- it is installed on demand so the editor does not carry a language server
for every language nobody asked for.

## Installing

Settings → **Install**, then the button beside *JSON language server*. Or from a checkout:

```
cpm install ./packages/chevron-lsp-json
```

The owned catalog is not published to npm, so a path is required rather than a
name. Reload the window after installing to activate the package.

## The server

[vscode-json-languageserver](https://www.npmjs.com/package/vscode-json-languageserver),
installed as an npm dependency of this package -- there is nothing to download
and no platform-specific binary.

Schema validation follows the `$schema` key in the document, so a file that
names a schema gets completions and diagnostics from it.

## Scopes

Registered for:

- `source.json`

## How it attaches

The package consumes the `chevron.lsp` service and registers `vscode-json` for the
scopes above. Open a matching file and the server starts; the LSP indicator in
the status bar shows when it is running. If no server is registered for a
scope, Chevron says so and points at the package that provides it.

## Licence

MIT. The language server it runs carries its own licence.
