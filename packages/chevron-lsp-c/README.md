# chevron-lsp-c

C, C++ and Objective-C support for [Chevron](https://github.com/builtbygio/chevron), through the
Language Server Protocol: completions, diagnostics, hovers, go-to-definition and
rename, wherever the server supports them.

This package is part of Chevron's owned catalog. It is **not bundled** with the
app -- it is installed on demand so the editor does not carry a language server
for every language nobody asked for.

## Installing

Settings → **Install**, then the button beside *C / C++ language server*. Or from a checkout:

```
cpm install ./packages/chevron-lsp-c
```

The owned catalog is not published to npm, so a path is required rather than a
name. Reload the window after installing to activate the package.

## The server

[clangd](https://clangd.llvm.org/) 22.1.6, run as `clangd --background-index`.

Unlike the other packages in the catalog, this one **prefers a clangd already on
your machine** and only downloads one if there is none. That keeps it consistent
with the toolchain your project is built with -- a clangd from a different LLVM
release can disagree with your headers.

Resolution order:

1. `clangd` on `PATH`
2. a versioned LLVM install (`/usr/lib/llvm-*/bin`, Homebrew, and the usual
   platform locations)
3. a prebuilt clangd downloaded into `server/bin/clangd`

Prebuilds are published for linux-x64, darwin-x64, darwin-arm64 and win32-x64.

clangd needs a **`compile_commands.json`** to understand a non-trivial project.
Generate one with `cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`, `bear -- make`, or
your build system's equivalent, and put it at the project root or in `build/`.
Without it clangd falls back to guessing flags, and reports missing includes it
would otherwise resolve.

## Scopes

Registered for:

- `source.c`
- `source.cpp`
- `source.objc`
- `source.objcpp`

## How it attaches

The package consumes the `chevron.lsp` service and registers `clangd` for the
scopes above. Open a matching file and the server starts; the LSP indicator in
the status bar shows when it is running. If no server is registered for a
scope, Chevron says so and points at the package that provides it.

## Licence

MIT. The language server it runs carries its own licence.
