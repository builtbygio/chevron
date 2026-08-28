# Historical `apm` tree (Phase 4+)

This directory used to vendor **atom-package-manager** for user package installs and product packaging.

**As of cpm Phases 0–4 (complete):**

- The **product does not ship** this tree.
- User and in-app package management is **`cpm`** (`../cpm/`).
- The **`apm` command name is retired** — nothing installs it. `PackageManager#getApmPath()` keeps its name (public API) but resolves `cpm/bin/cpm`.
- Monorepo scripts that used to invoke classic apm now use **host npm** or the monorepo **cpm** shim (`script/config.js` → `getApmBinPath()`).

You may still run `./script/bootstrap-modern --with-apm` to install atom-package-manager here for archaeology/debugging. That path is **not** used by packaging or CI.

See:

- [docs/orientation/cpm-cutover.md](../docs/orientation/cpm-cutover.md)
- [docs/reference/cpm-design.md](../docs/reference/cpm-design.md)
- [docs/process/cpm-phase-4-complete.md](../docs/process/cpm-phase-4-complete.md)
