# Historical `apm` tree (Phase 4)

This directory used to vendor **atom-package-manager** for user package installs and product packaging.

**As of cpm Phase 4:**

- The **product does not ship** this tree.
- User and in-app package management is **`cpm`** (`cpm/` in the monorepo).
- The **`apm` command name** remains a **shim → cpm** for scripts and muscle memory.

You may still run `./script/bootstrap-modern --with-apm` to install atom-package-manager here for archaeology/debugging. That path is **not** used by packaging or CI.

See [docs/cpm-design.md](../docs/cpm-design.md) Phase 4 and [docs/cpm-phase-4-complete.md](../docs/cpm-phase-4-complete.md).
