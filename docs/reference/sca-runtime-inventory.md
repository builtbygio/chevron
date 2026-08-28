# SCA / runtime npm audit inventory

**Status:** living inventory (audit P1)  
**Method:** `npm audit --omit=dev` on the monorepo root (host Node 24)  
**Snapshot date:** 2026-08-13 (ls-archive tar 7 fork)

Chevron inherits a large Atom-era dependency graph. Many advisories have **no clean fix without forking** packages or replacing deprecated stacks (`request`, Babel 5, old mocha). This doc separates **runtime attack surface** from **test/tooling noise** so effort goes to the former.

## Severity snapshot (approximate)

| Severity | Count (typical) | Notes |
|----------|----------------:|--------|
| critical | dozens | Mix of runtime leftovers + test (mocha/growl/minimist) + `request` |
| high | many | Includes package-level rollups |
| moderate / low | rest | Track opportunistically |

Exact numbers drift with registry data; re-run audit after lockfile changes.

## Priority: runtime / product path

| Package | Severity | Status | Action |
|---------|----------|--------|--------|
| **dompurify** | critical | **Done** — 3.4.13 | Owned **markdown-preview**, **autocomplete-plus**, **github**, **notifications**, **settings-view**; in-repo **deprecation-cop**; root override |
| **marked** | high | **Done** — 4.3.0 (last CJS) | Same packages. marked 5+ is ESM-only — do not jump without converting `require()` |
| **tar** (dugite extract) | critical | **Done** — 7.5.21 via override | dugite 1.x still declares tar `^4.4.7`; `tar.extract({cwd})` is still a stream in 7.x. GHSA range `<=7.5.18` included tar 6 |
| **dugite** | high | **Partial** — 1.110.0 | github pin. 2.x/3.x change git-embed layout — not this pass |
| **async** | high | **Done** (≥3.2.6) | Audit P1 |
| **request** | critical | **Done** | Owned source uses `fetch`. App tree: `pnpm why request` is empty (`less@3.13.1` override; watcher dropped `electron-rebuild@1`). Guard: `script/ci/no-request.test.js` |
| **form-data** | critical | Open | Follows `request` removal |
| **babel-core@5** | ~~high~~ | **Removed** (#62 Option 3) | Residual only if transitive |
| **minimatch** / **brace-expansion** | high | Opportunistic | Bump when parent allows; watch DoS on untrusted globs |
| **archive-view** / **ls-archive** | high | **Done** | **builtbygio/ls-archive** keeps `list`/`readFile`; **tar 7** `Parser` replaces `tar@2` `Parse()`. Zip still `yauzl`. Do not npm-override the old 1.3.4 extract API |
| **autocomplete-plus** (rollup) | high | **Sanitizer done** | Other rollup CVEs still via older helpers |

Root overrides (also documented in [dependency-graph.md](./dependency-graph.md)):

```json
"overrides": {
  "nan": "2.28.0",
  "dompurify": "3.4.13",
  "marked": "4.3.0",
  "dugite": { "tar": "7.5.21" },
  "minimatch@3": "3.1.4",
  "brace-expansion@1": "1.1.18",
  "js-yaml@3": "3.15.1",
  "lodash": "4.18.0",
  "form-data@2": "2.5.6",
  "tar@6": "7.5.21",
  "tar@7": "7.5.21"
}
```

The same-major security overrides are also on `script/`, `apm/`, in-repo package locks, and leftover `script/vsts` + `script/update-server` (Dependabot scans every committed lockfile). Still **no clean fix** for residual `request`/`hawk`/`hoek` or mocha/growl test trees.

CI: `script/ci/sca-runtime.test.js` (unit-and-cpm job).

## npm install warnings (not hidden)

Bootstrap and CI intentionally use **default npm loglevel** so deprecations stay visible. Do not reintroduce `--loglevel=error` / `fund=false` / `audit=false` as a “fix”.

| Source | What you see | Real remediation |
|--------|----------------|------------------|
| **cpm** (`@electron/rebuild`, pacote) | Was: glob/tar/rimraf/inflight spam | Bumped rebuild/pacote/arborist; **cpm uses `node-gyp-build`**, not `prebuild-install` |
| **prebuild-install (deprecated)** | Upstream: use **prebuildify + node-gyp-build** | First-party: tree-sitter/watcher install scripts migrated; cpm prebuild order prefers node-gyp-build; residual transitive pulls from unowned packages only |
| **Root app** | Nested old trees from git packages | Prefer prebuildify-bundled `prebuilds/`; rebuild via bootstrap when needed |
| **babel-core@5 / coffee-script** | Deprecation + SCA | **Removed** from app runtime deps (#62 Options 2–3) |
| **request / form-data** | Critical audit | Fork/replace packages that still pull `request` |
| **legacy-peer-deps** | Peer skew without ERESOLVE | Required for Atom-era tree; not a silence flag — remove only after peer graph is fixed |

Re-check after lockfile changes:

```bash
cd cpm && rm -rf node_modules && npm ci 2>&1 | grep deprecated || true
npm audit --omit=dev
```

## Deprioritise: test / lint / build-only

These often show as critical/high but are not loaded in the production editor path for end users:

| Package | Notes |
|---------|--------|
| mocha, growl, debug (old), diff (old mocha tree) | Spec runner / reporters |
| eslint / standard (nested in packages) | Dev lint inside package trees |
| minimist/mkdirp via mocha | Test tooling |
| node-gyp `tar` 4.x | Build-time Electron/native rebuild, not editor HTML/git extract |

Still worth cleaning when upgrading the test stack, but not a Phase S blocker.

## Accepted residual risk (document, don’t paper over)

1. **Transitive CVEs with `fixAvailable: false`** until the owning package is forked and dependency tree rewritten.  
2. **Community packages** install their own deps via cpm/Pulsar — outside this inventory; community require restrict limits privileged Node, not every transitive npm CVE.  
3. **Babel 5 + coffee-script** removed from app runtime deps (#62 Options 2–3). Community packages must precompile.
4. Residual **`request` / `form-data`** only if an unowned or test tree still pulls them. Owned runtime clients use `fetch`.  
5. **`ls-archive` tar 2.x** replaced by [builtbygio/ls-archive](https://github.com/builtbygio/ls-archive) (tar 7).  
6. **dugite 2/3** not taken — GitProcess embed layout change is a separate github-package pass.

## How to re-run

```bash
# Root app graph
npm audit --omit=dev

# Optional: cpm CLI graph
cd cpm && npm audit --omit=dev
```

Record material changes in [CHANGELOG.md](../../CHANGELOG.md) and bump this snapshot date.

## Related

- [package-ownership-inventory.md](./package-ownership-inventory.md)  
- [security-threat-model.md](./security-threat-model.md)  
- [SECURITY.md](../../SECURITY.md)  
