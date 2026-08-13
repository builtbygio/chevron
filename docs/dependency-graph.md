# Dependency graph (Stream E)

**Root install:** host `npm ci --ignore-scripts --legacy-peer-deps`  
**Product packages:** cpm (separate tree)

## Shape (root `package.json`)

| Kind | Meaning |
|------|---------|
| `file:` | Monorepo `packages/*` |
| `git+…builtbygio` | Owned catalog pins (must not regress to `atom/*`) |
| `git+…atom/*` | Still-upstream language / leftover pins — [issue #79](https://github.com/builtbygio/chevron/issues/79) |
| semver | npm registry |

Guards: `script/ci/package-pin-policy.test.js` (owned pins), `script/ci/dep-graph.test.js` (counts, forbidden runtimes, overrides), and `script/ci/sca-runtime.test.js` (marked / DOMPurify / dugite tar).

## Overrides (Stream B + runtime SCA)

```json
"overrides": {
  "nan": "2.28.0",
  "dompurify": "3.4.13",
  "marked": "4.3.0",
  "dugite": { "tar": "6.2.1" },
  "minimatch@3": "3.1.4",
  "brace-expansion@1": "1.1.18",
  "js-yaml@3": "3.15.1",
  "lodash": "4.18.0"
}
```

- **nan** — keytar (and other nested `nan`) on the V8-safe line so `patch-keytar-nan` / `patch-nested-nan` become no-ops after a clean `npm ci`.
- **dompurify / marked** — product-path HTML sanitizer/parser (last CJS marked; current DOMPurify). Owned package pins declare the same versions.
- **dugite.tar** — dugite 1.x still asks for tar 4; 6.2.1 is the last 6.x with the path-traversal fix and still supports the stream extract API dugite uses.
- **minimatch / brace-expansion / js-yaml / lodash** — same-major Dependabot pins (plus form-data / tar 6–7 / postcss 8 in `package.json`). Does not replace `request` or tar 2.x.

See [sca-runtime-inventory.md](./sca-runtime-inventory.md).

## What we are not doing in this stream

| Item | Why |
|------|-----|
| Drop `--legacy-peer-deps` | Atom-era peer skew; would break `npm ci` |
| Mass-upgrade git pins | Each pin needs a package PR + smoke |
| Dependabot-fix-everything | Tracked in [sca-runtime-inventory.md](./sca-runtime-inventory.md); not a bootstrap gate |

## Next (when touching packages)

1. Prefer **builtbygio** SHA bumps over new `atom/*` pins.  
2. New `atom/*` git deps fail the dep-graph **ceiling** test (raise only with an issue).  
3. Owned packages: [owned-package-modernization-checklist.md](./owned-package-modernization-checklist.md).
