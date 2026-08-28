# Contributing to Chevron packages

Official bundled packages live in this monorepo under `packages/` or in **owned** `builtbygio/*` forks, git-pinned from the root `package.json`.

## Where to start

| Need | Doc |
|------|-----|
| Project workflow | [CONTRIBUTING.md](../../CONTRIBUTING.md) |
| Docs index | [README.md](../README.md) |
| Package Node / privilege tiers | [package-node-policy.md](../reference/package-node-policy.md) |
| Owned-catalog modernization | [owned-package-modernization-checklist.md](./owned-package-modernization-checklist.md) |
| Install / rebuild | [cpm-cutover.md](./cpm-cutover.md), [cpm-prebuilds.md](./cpm-prebuilds.md) |

1. Open or comment on a GitHub issue before large work.
2. Prefer `engines.chevron`, `require('chevron')`, and `global.chevron`.
3. Integration gate is **Chevron CI** (bootstrap → build → smoke), not Atom’s old download channels.

The old Atom Flight Manual page on “official Atom packages” is unmaintained. Do not treat it as current.
