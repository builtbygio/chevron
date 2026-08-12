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

Guards: `script/ci/package-pin-policy.test.js` (owned pins) and `script/ci/dep-graph.test.js` (counts, forbidden runtimes, `nan` override).

## Overrides (Stream B)

```json
"overrides": { "nan": "2.28.0" }
```

Forces **keytar** (and any other nested `nan`) onto the V8-safe line so `patch-keytar-nan` / `patch-nested-nan` become no-ops after a clean `npm ci`.

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
