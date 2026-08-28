# fuzzy-finder (Chevron)

Quick-open. Path crawl runs **in-process** (ripgrep by default). Does
**not** call `Task`. Uses `@vscode/ripgrep@1.15.14` (same CJS `rgPath`
as the deprecated `vscode-ripgrep` name). Chevron `Task` stays for
other callers (`Workspace.replace`).
