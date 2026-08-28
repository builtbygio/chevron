# Dependency graph (Stream E)

**Root install:** `pnpm install --ignore-scripts` (`--frozen-lockfile` in CI)  
**Product packages:** cpm (separate tree, still `npm ci`)  
**Build scripts:** `script/` (separate tree, still `npm ci`)

## Shape (root `package.json`)

| Kind | Meaning |
|------|---------|
| `npm:@builtbygio/<id>@ver` | In-repo catalog on npmjs.com (editor id stays unscoped) |
| `git+…builtbygio` | Owned catalog pins not yet published (must not regress to `atom/*`) |
| `git+…atom/*` | **None** (#79 closed). Ceiling test is 0. |
| semver | npm registry |

Guards: `script/ci/package-pin-policy.test.js` (owned pins), `script/ci/dep-graph.test.js` (counts, npm aliases, forbidden runtimes, overrides), and `script/ci/sca-runtime.test.js` (marked / DOMPurify / dugite tar).

## Overrides (Stream B + runtime SCA)

App install is pnpm 11, which reads `overrides` from **`pnpm-workspace.yaml`**. Keep that list in sync with `package.json` `"overrides"` (still used by npm trees and by tests). Nested npm form `"dugite": { "tar": "7.5.21" }` is mirrored as pnpm `'dugite>tar': 7.5.21`.

```json
"overrides": {
  "nan": "2.28.0",
  "dompurify": "3.4.13",
  "marked": "4.3.0",
  "dugite": { "tar": "7.5.21" },
  "dugite>tar": "7.5.21",
  "minimatch@3": "3.1.4",
  "brace-expansion@1": "1.1.18",
  "js-yaml@3": "3.15.1",
  "lodash": "4.18.0"
}
```

- **nan** — `overrides.nan=2.28.0`; owned native forks declare `nan@2.28.0`.
- **dompurify / marked** — product-path HTML sanitizer/parser (last CJS marked; current DOMPurify). Owned package pins declare the same versions.
- **dugite.tar** — dugite 1.x still *declares* tar `^4`; override is **7.5.21**. `tar.extract({ cwd })` remains a pipeable stream in 7.x (GHSA range `<=7.5.18` includes tar 6).
- **minimatch / brace-expansion / js-yaml / lodash** — same-major Dependabot pins (plus form-data / tar 6–7 / postcss 8 in `package.json`). Does not replace residual `request`. archive-view's **ls-archive** is the owned tar 7 fork.

See [sca-runtime-inventory.md](./sca-runtime-inventory.md).

## What we are not doing in this stream

| Item | Why |
|------|-----|
| Strict pnpm peers | Atom-era peer skew; `.npmrc` has `strict-peer-dependencies=false` |
| Mass-upgrade git pins | Each pin needs a package PR + smoke |
| Dependabot-fix-everything | Tracked in [sca-runtime-inventory.md](./sca-runtime-inventory.md); not a bootstrap gate |

## Next (when touching packages)

1. Prefer **builtbygio** SHA bumps over new `atom/*` pins.  
2. New `atom/*` git deps fail the dep-graph **ceiling** test (raise only with an issue).  
3. Owned packages: [owned-package-modernization-checklist.md](../orientation/owned-package-modernization-checklist.md).
