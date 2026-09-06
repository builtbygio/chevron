# chevron-lsp-python

Python support for [Chevron](https://github.com/builtbygio/chevron), through the
Language Server Protocol: completions, diagnostics, hovers, go-to-definition and
rename, wherever the server supports them.

This package is part of Chevron's owned catalog. It is **not bundled** with the
app -- it is installed on demand so the editor does not carry a language server
for every language nobody asked for.

## Installing

Settings → **Install**, then the button beside *Python language server*. Or from a checkout:

```
cpm install ./packages/chevron-lsp-python
```

The owned catalog is not published to npm, so a path is required rather than a
name. Reload the window after installing to activate the package.

## The server

[Pyright](https://github.com/microsoft/pyright), installed as an npm dependency
of this package and run as `pyright-langserver --stdio`. Nothing is downloaded
separately.

Pyright reads `pyrightconfig.json` or the `[tool.pyright]` section of
`pyproject.toml` from the project root. Point it at the interpreter for your
virtualenv (`venvPath` and `venv`) if imports resolve in the terminal but not in
the editor -- that is nearly always what a spurious "could not be resolved" is.

## Scopes

Registered for:

- `source.python`

## How it attaches

The package consumes the `chevron.lsp` service and registers `pyright` for the
scopes above. Open a matching file and the server starts; the LSP indicator in
the status bar shows when it is running. If no server is registered for a
scope, Chevron says so and points at the package that provides it.

## Licence

MIT. The language server it runs carries its own licence.
