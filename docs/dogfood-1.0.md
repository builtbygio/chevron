# 1.0 dogfood week

**Goal:** use Chevron 1.0 unsigned preview as a daily editor for seven days and file blockers.  
**Not:** a promise that 1.0 is crash-free. Smoke tests boot 75 packages; they do not replace a week of editing.

## Protocol

1. Install the unsigned preview from https://github.com/builtbygio/chevron/releases (or run `out/Chevron-linux-x64/chevron` from a local build).
2. Config home is `~/.chevron` (set `ATOM_HOME` only if you must reuse an Atom tree).
3. Work in real repos. Prefer owned-catalog features (edit, git, find, tree-view, markdown preview, autocomplete, LSP if you have a server).
4. File issues for crashes, data loss, “cannot open project”, broken save, or git that eats work. Everything else is a note.
5. Do **not** treat Pulsar/community package install as supported.

## Daily checklist (copy into the tracking issue)

- [ ] Day 1 — install / first-run Welcome + Guide; open a real project; save a file
- [ ] Day 2 — search / find-and-replace; tree-view; git status + commit (github package)
- [ ] Day 3 — markdown preview; autocomplete; one language grammar you actually use
- [ ] Day 4 — Check for Update opens the Releases page; About version is 1.0.1
- [ ] Day 5 — LSP path if you use it (`chevron-lsp-*` or workspace trust)
- [ ] Day 6 — settings-view (install is owned-catalog only); notifications
- [ ] Day 7 — cold start, large file, and “would I use this tomorrow?”

## Already exercised (2026-08-12, Linux x64)

Local Class C fold build: `node script/ci/smoke-test.js` **PASSED** (linux-boot, 75 packages active, probe.ts/css opened). Full tree-sitter editor probe did not finish under this display (same linux-boot acceptance as CI).

## Out of scope this week

Host v2, `@electron/packager`, signing. Language-* forks (#79) and the Linux/Windows snapshot landed.
