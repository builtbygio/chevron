# language-csharp (Chevron)

C# highlighter for Chevron. Tree-sitter is the default for `source.cs`
(`tree-sitter-c-sharp@0.23.5` via `grammars/tree-sitter-c-sharp.json`).
Official grammar; npm prebuilds for linux/darwin/win32 x64+arm64. ESM;
Chevron loads it through `load-tree-sitter-language.js`.

`source.csx` and `source.cake` stay TextMate-only (`csx.json`,
`cake.json`). TextMate fallback for `source.cs` is `grammars/csharp.json`.
Settings and snippets ship as JSON. 13c: no CSON in `grammars/` /
`settings/` / `snippets/`. `spec/` may still have Coffee.

Owned so the pin is not an archived `atom/*` remote.
Chevron loads this via `packageDependencies`.
