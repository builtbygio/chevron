# SCA / runtime npm audit inventory

**Status:** living inventory (audit P1 — issue #56)  
**Method:** `npm audit --omit=dev` on the monorepo root (host Node 24)  
**Snapshot date:** 2026-08 (post-0.6.0 audit)  

Chevron inherits a large Atom-era dependency graph. Many advisories have **no clean fix without forking** packages or replacing deprecated stacks (`request`, Babel 5, old mocha). This doc separates **runtime attack surface** from **test/tooling noise** so effort goes to the former.

## Severity snapshot (approximate)

| Severity | Count (typical) | Notes |
|----------|----------------:|--------|
| critical | ~9 | Mix of runtime + test (mocha/growl/minimist) |
| high | ~47 | Includes package-level rollups |
| moderate / low | rest | Track opportunistically |

Exact numbers drift with registry data; re-run audit after lockfile changes.

## Priority: runtime / product path

| Package | Severity | Why it matters | Action |
|---------|----------|----------------|--------|
| **dompurify** | critical | HTML sanitization; used under markdown / autocomplete stacks | Bump or override via owned **markdown-preview** / **autocomplete-plus** forks |
| **marked** (via packages) | high | Markdown parse → HTML | Same owned forks |
| **tar** | critical | Extract paths; **dugite** / install paths | Prefer current dugite; cpm uses pacote — keep cpm deps current |
| **dugite** | high | github package git exec | Owned **github** pin; upgrade dugite when forking |
| **async** | high | Direct dep; prototype pollution in ≤3.2.1 | **Bump to ≥3.2.6** (done in audit P1) |
| **request** | critical | Deprecated HTTP client in old package trees | Replace when touching dependent packages; no global easy fix |
| **form-data** | critical | Often under `request` | Follows `request` removal |
| **babel-core@5** | high | Runtime transpile for community Coffee/JS | Isolate/retire path (audit #62); do not “upgrade to babel 7” casually without compile-cache plan |
| **minimatch** / **brace-expansion** | high | Glob in project search / package paths | Bump when parent allows; watch DoS on untrusted globs |
| **archive-view** / **ls-archive** | high | Opening archives | Fork **archive-view** when next security touch |
| **autocomplete-plus** (rollup) | high | Pulls sanitizer stack | Owned fork — land dep bumps there |

## Deprioritise: test / lint / build-only

These often show as critical/high but are not loaded in the production editor path for end users:

| Package | Notes |
|---------|--------|
| mocha, growl, debug (old), diff (old mocha tree) | Spec runner / reporters |
| eslint / standard (nested in packages) | Dev lint inside package trees |
| minimist/mkdirp via mocha | Test tooling |

Still worth cleaning when upgrading the test stack, but not a Phase S blocker.

## Accepted residual risk (document, don’t paper over)

1. **Transitive CVEs with `fixAvailable: false`** until the owning package is forked and dependency tree rewritten.  
2. **Community packages** install their own deps via cpm/Pulsar — outside this inventory; community require restrict limits privileged Node, not every transitive npm CVE.  
3. **Babel 5 + coffee-script** remain for community package transpile until #62.

## How to re-run

```bash
# Root app graph
npm audit --omit=dev

# Optional: cpm CLI graph
cd cpm && npm audit --omit=dev
```

Record material changes in [CHANGELOG.md](../CHANGELOG.md) and bump this snapshot date.

## Related

- [package-ownership-inventory.md](./package-ownership-inventory.md)  
- [security-threat-model.md](./security-threat-model.md)  
- [SECURITY.md](../SECURITY.md)  
