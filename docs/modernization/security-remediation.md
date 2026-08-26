# Security Remediation Roadmap

This document outlines the plan for addressing the 64 security vulnerabilities identified in the initial audit.

## 1. Immediate Action: Critical & High Vulnerabilities

These packages pose an immediate risk of Prototype Pollution, Command Injection, or Denial of Service.

| Package | Severity | Risk Type | Recommended Action | Status |
| :--- | :--- | :--- | :--- | :--- |
| `lodash` | **Critical** | Prototype Pollution | Upgrade to `^4.17.21` | **Done** — root override `4.18.0` |
| `tar` | **Critical** | Path Traversal / DoS | Upgrade to `^7.5.21` | **Done** — all tar (including dugite) pinned to `7.5.21`. `tar.extract({cwd})` still returns a stream in 7.x |
| `shelljs` | **High** | Privilege Management | Upgrade to `^0.8.5` | **Done** — override `0.8.5` |
| `cross-spawn` | **High** | ReDoS | Upgrade to `^7.0.6` | **Done** — `cross-spawn@6`/`@7` overrides |
| `minimist` | **Critical** | Prototype Pollution | Upgrade to `^1.2.8` | **Done** — `minimist@0`/`@1` overrides |
| `semver` | **High** | ReDoS | Upgrade to `^7.5.2` | **Done** — direct `7.8.5` plus `semver@5`/`@6` overrides |
| `nanoid` | **High** | Denial of Service | Upgrade to `^3.3.18` | **Done** — `nanoid@3` override `3.3.18` |

**Strategy:** Root `overrides` plus `pnpm-workspace.yaml` `overrides` force the secure versions through the git-pinned catalog.

`pnpm audit` on the app tree (2026-08-21): **0 critical, 0 high**, 3 moderate (ajv 6 is the remaining ESLint-bound pin). `script/` no longer vendors `npm@6`; it uses the host npm CLI.

## 2. Scheduled Action: Moderate Vulnerabilities

| Package | Severity | Risk Type | Recommended Action | Status |
| :--- | :--- | :--- | :--- | :--- |
| `ajv` | Moderate | ReDoS / Prototype Pollution | Upgrade to `^8.x` | **Pinned** `ajv@6` `6.14.0`. ESLint 9.39 still depends on ajv 6; forcing 8.x breaks the schema compiler |
| `debug` | High | ReDoS | Upgrade to latest | **Done** — mocha 11 pulls `debug@4`; override `debug@4` `4.4.1` (and `debug@3` `3.2.7` for leftovers) |
| `diff` | High | ReDoS | Upgrade to latest | **Done** — mocha 11 pulls `diff@5`; override `diff@5` `5.2.2` (and `diff@3` `3.5.1` for leftovers) |
| `got` | Moderate | SSRF (Redirects) | Upgrade to latest | **Done** — dugite `download-git.js` uses Node `https` (patch `dugite@1.110.0`); app tree no longer depends on `got` |
| `qs` | Moderate | Denial of Service | Upgrade to latest | **Done** — `qs@6` `6.14.1` |

## 3. Long-term: Infrastructure & Transitive Dependencies

*   **`eslint` / `standard`:** **Done (engine).** `script/` is ESLint **9.39** + `eslint-config-standard` **17** + `eslint-plugin-n` **17**. Lint still uses `.eslintrc.json` via `ESLINT_USE_FLAT_CONFIG=false` (standard 17 is eslintrc; ESLint 10 drops that). Prettier 1 stays so `script/lint` does not mass-reformat. Flat config + ajv 8 wait on ESLint 10 / neostandard.
*   **`mocha`:** **Done.** App mocha is **11.8.0** (still CJS; mocha 12 is the ESM rewrite). Main-process tests (`spec/main-process/mocha-test-runner.js`) stay on mocha. Jasmine (`script/test`) is unchanged.
*   **`request`:** **Done for owned code.** VSTS scripts and `download-file-from-github` use `fetch`. `less-cache` is overridden to **less 3.13.1** (less 2 pulled `request`). Watcher dropped `electron-rebuild@1` / `mocha-appveyor-reporter`. Guard: `script/ci/no-request.test.js`. `pnpm why request` is empty on the app tree.

## Remediation Workflow
1.  **Identify:** Locate the dependency path using `pnpm why <package>` (app tree) or `npm list <package>` (`script/` / `cpm/`).
2.  **Test:** Create a regression test case for the specific vulnerability if possible.
3.  **Upgrade:** Attempt a standard upgrade.
4.  **Override:** If a direct upgrade is impossible, use the root / `pnpm-workspace.yaml` `overrides` field.
5.  **Verify:** Run `node --test script/ci/*.test.js` and the full suite (`script/test`) to ensure no breaking changes were introduced.
