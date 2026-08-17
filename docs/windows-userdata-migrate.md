# Windows userData migration (`atom` → `chevron`)

| Field | Value |
|-------|-------|
| **Status** | Design. **No code change yet.** This is the gate PR 23b depends on |
| **Scope** | Windows only. macOS and Linux already use Chevron-named paths |
| **Blocks** | H3 PR 23b — `script/lib/generate-metadata.js` intermediate `package.json` `name` |

---

## The problem

`script/lib/generate-metadata.js` (lines 12–20) deliberately keeps the Atom-era name:

```js
let intermediatePackageName = CONFIG.appMetadata.name;
if (process.platform === 'win32') {
  intermediatePackageName =
    CONFIG.channel === 'stable' ? 'atom' : `atom-${CONFIG.channel}`;
}
```

Electron derives `app.getPath('userData')` from that `name`, so on Windows every Chevron install writes to **`%LOCALAPPDATA%\atom`** (or `atom-<channel>`). `productName` is already `Chevron`; only the data folder is legacy.

Flipping the name without a migration silently strands, on the next launch:

| What | Where |
|------|-------|
| User config | `config.json` (and legacy `config.cson`) |
| Window/session state | `IndexedDB` StateStore — open editors, pane layout, project trees |
| Installed packages | `packages/` under the Chevron home |
| Compile caches | `compile-cache/`, `blob-store/` |
| Workspace trust | `trusted-projects.json` — LSP gating |
| Credentials | `keytar` entries are OS-keychain, **not** userData; unaffected |

The user sees a factory-fresh editor with their work "gone". It is recoverable by hand, but nobody should have to.

> **Note the two different homes.** `$CHEVRON_HOME` (`~/.chevron`, see `src/user-config-path.js`) is *not* the same as Electron's `userData`. This document is only about `userData`. Config-home migration was PR 5 and is already done.

---

## Principles

1. **Copy, never move.** A move makes downgrade a data-loss event. Disk cost is bounded — these trees are tens of MB, dominated by caches we can skip.
2. **Migrate once, and record it.** A `migrated-from-atom.json` marker in the new tree prevents re-running and re-clobbering newer data.
3. **Never overwrite newer data.** If the destination already has `config.json`, leave it. First-writer wins.
4. **Skip regenerable data.** Compile caches and blob stores are rebuilt on demand; copying them doubles the migration time for no benefit.
5. **Fail open.** Any error → log, leave the legacy tree untouched, continue booting with an empty profile. A failed migration must not be a failed launch.
6. **Escapable.** `CHEVRON_SKIP_USERDATA_MIGRATE=1` bypasses entirely.

---

## What moves

| Source (`%LOCALAPPDATA%\atom\`) | Action |
|--------------------------------|--------|
| `config.json`, `config.cson` | Copy if absent at destination |
| `storage/` / StateStore IndexedDB | Copy whole directory |
| `trusted-projects.json` | Copy — losing it silently disables LSP until re-trusted |
| `packages/` | Copy |
| `compile-cache/`, `blob-store/` | **Skip** — regenerable |
| `Cache/`, `GPUCache/`, `Code Cache/` | **Skip** — Chromium caches |
| `Crashpad/` | **Skip** |
| `Session Storage/`, `Local Storage/` | Copy — some packages persist here |

---

## When it runs

In **main**, before the first `BrowserWindow` and before anything reads config — `src/main-process/start.js`, ahead of `AtomApplication` construction. It must not race the StateStore opening IndexedDB.

```text
main.js
  → start.js
      migrateWindowsUserData()      ← new, win32 only, synchronous
      → AtomApplication
          → AtomWindow
```

Synchronous is acceptable here: it runs at most once per machine, and the alternative is a partially-populated profile racing a window that is already reading it.

---

## Algorithm

```text
if process.platform !== 'win32'            -> skip
if CHEVRON_SKIP_USERDATA_MIGRATE           -> skip
dest = app.getPath('userData')             // ...\chevron
legacy = dest/../atom[-channel]
if !exists(legacy)                         -> skip (fresh install)
if exists(dest/migrated-from-atom.json)    -> skip (already done)
if legacy === dest                         -> skip (name not flipped yet)

for each entry in the "what moves" table:
    if exists(dest/entry)  -> skip that entry   // never overwrite
    copy legacy/entry -> dest/entry             // recursive, best-effort

write dest/migrated-from-atom.json {
  from: legacy, at: ISO8601, chevronVersion, entriesCopied[], errors[]
}
log one line; if errors, surface a startup notification
```

The marker is written **even on partial failure**, with the errors recorded. Retrying automatically on next boot would re-copy over a profile the user has since edited.

---

## Downgrade

An older build still reads `%LOCALAPPDATA%\atom`, which the copy left intact. The user's pre-migration state is there and unchanged. Work done *after* migrating does not travel back — acceptable, and the reason for copy-not-move.

---

## Rollout

1. **This document** — the PR 23b gate. No code.
2. **Migration, name unchanged.** Land `migrateWindowsUserData()` behind `CHEVRON_USERDATA_MIGRATE=1`, inert by default. Lets it be exercised on a real Windows profile before it matters.
3. **Flip the name** (PR 23b proper): `generate-metadata.js` uses `chevron` / `chevron-<channel>`, migration on by default, `docs/releases.md` gains an upgrade note.
4. **Remove the migration** a few releases later, once installs have rolled over.

Steps 2 and 3 must not be the same PR. Step 2 is testable in isolation; step 3 is the irreversible half.

---

## Verification

Cannot be smoke-tested from Linux CI. Needs, on the Windows runner:

- `script/ci` unit coverage of the path logic with a fixture tree (platform-independent, runs everywhere)
- a Windows-only integration check: seed a fake `%LOCALAPPDATA%\atom`, boot the packaged app, assert config and trusted-projects arrive and the legacy tree is untouched
- explicit assertions: no overwrite of existing destination files; marker prevents a second run; missing legacy tree is a no-op

---

## Open questions

| # | Question |
|---|----------|
| 1 | Do we migrate `atom-dev` / `atom-beta` channels, or stable only? |
| 2 | Is there a known Windows install base? If effectively zero, skip the migration and just flip the name (**cheapest correct answer** — settle this before writing code) |
| 3 | Should the user be told, or should it be silent? A notification for a successful copy is noise; for a partial failure it is essential |
| 4 | `packages/` can be large. Cap the copy, or accept the one-time cost? |
