# Windows userData naming (`atom` → `chevron`)

| Field | Value |
|-------|-------|
| **Status** | **Resolved 2026-08-18 — no migration built.** The name is flipped; H3 PR 23b is done |
| **Scope** | Windows only. macOS and Linux already use Chevron-named paths |

---

## Outcome

`script/lib/generate-metadata.js` now writes `chevron` / `chevron-<channel>` as the intermediate `package.json` `name`, so Electron puts userData in `%LOCALAPPDATA%\chevron`. **No migration code exists, and none is needed.**

## Why there is no migration

This document previously specified a copy-forward migration out of `%LOCALAPPDATA%\atom`. It listed open question 2 as the thing to settle first:

> Is there a known Windows install base? If effectively zero, skip the migration and just flip the name (**cheapest correct answer** — settle this before writing code)

**Answer, from the product owner on 2026-08-18: there are no Windows users.**

A migration exists to protect data that real installs already hold. With no installs, it protects nothing. It would have been permanent complexity in the boot path — a copy loop, a marker file, an env flag, a failure mode on every launch — guarding against a loss that cannot occur.

So the migration was designed, implemented, and then **discarded unmerged** rather than shipped. The name flip alone is the whole change.

## What this means in practice

| Situation | Result |
|-----------|--------|
| New Windows install | userData at `%LOCALAPPDATA%\chevron`. Nothing to migrate |
| A stray pre-flip install | Its data stays in `%LOCALAPPDATA%\atom`, untouched. The app will not read it; the folder can be deleted by hand |
| Downgrade to a pre-flip build | Reads `%LOCALAPPDATA%\atom` again. The two trees are independent |

`productName` was already `Chevron`; only the data folder lagged.

## If this assumption ever breaks

If Windows installs exist before this ships — a signed release, a dogfooder, anyone — then the flip orphans them and the decision must be revisited. The recovery is not complicated: the old tree is still on disk under `atom`, so a user can copy it across, or a migration can be reintroduced.

The design that was written for it is in this file's history (PR #199), and the implementation in the closed PR #206. Neither is lost; both are recoverable if the premise changes.

## Related

- `$CHEVRON_HOME` (`~/.chevron`, `src/user-config-path.js`) is a **different** home and was migrated separately in H1 PR 5. This document only ever concerned Electron's `userData`.
- `docs/reference/releases.md` — release notes.
- `docs/reference/chevron-architecture-modernization.md` PR 23b.
