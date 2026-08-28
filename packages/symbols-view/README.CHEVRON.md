# symbols-view (Chevron)

Go-to-symbol (ctags fallback when LSP is absent). `getAllTags` reads
tags files in-process. Does **not** call `Task`. Chevron `Task` stays
for other callers (`Workspace.replace`).
