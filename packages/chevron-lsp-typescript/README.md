# chevron-lsp-typescript

TypeScript and JavaScript support for [Chevron](https://github.com/builtbygio/chevron), through the
Language Server Protocol: completions, diagnostics, hovers, go-to-definition and
rename, wherever the server supports them.

This package is part of Chevron's owned catalog. It is **not bundled** with the
app -- it is installed on demand so the editor does not carry a language server
for every language nobody asked for.

## Installing

Settings → **Install**, then the button beside *TypeScript language server*. Or from a checkout:

```
cpm install ./packages/chevron-lsp-typescript
```

The owned catalog is not published to npm, so a path is required rather than a
name. Reload the window after installing to activate the package.

## The server

[typescript-language-server](https://github.com/typescript-language-server/typescript-language-server)
with its own copy of [TypeScript](https://www.typescriptlang.org/), both
installed as npm dependencies of this package. Nothing is downloaded separately.

The bundled TypeScript is what the server type-checks with. A project pinned to
a different TypeScript version can report diagnostics that differ from its own
`tsc` -- worth knowing before filing one as a bug.

JavaScript files are handled by the same server, so a project needs no
`tsconfig.json` to get completions and go-to-definition.

## Scopes

Registered for:

- `source.ts`
- `source.tsx`
- `source.js`
- `source.js.jsx`
- `source.jsx`
- `source.flow`

## How it attaches

The package consumes the `chevron.lsp` service and registers `typescript` for the
scopes above. Open a matching file and the server starts; the LSP indicator in
the status bar shows when it is running. If no server is registered for a
scope, Chevron says so and points at the package that provides it.

## Licence

MIT. The language server it runs carries its own licence.
