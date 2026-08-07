# Security Policy

## Supported versions

Chevron is early-stage (pre-1.0). Security fixes land on the default branch and ship in the next tagged release when practical.

| Version | Supported |
| ------- | --------- |
| **0.6.x** | Yes — current series |
| 0.5.x | Best effort only (prefer upgrade to 0.6.x) |
| 0.4.x and earlier | No |

Electron, Chromium, and Node security fixes generally require rebuilding on a current Electron ladder step; see [README](README.md) and [CHANGELOG](CHANGELOG.md).

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Preferred:

1. Use [GitHub Security Advisories](https://github.com/builtbygio/chevron/security/advisories/new) for private disclosure when available on this repository.
2. If advisories are unavailable, open a **private** contact path via the maintainer on GitHub ([@builtbygio](https://github.com/builtbygio) / account that owns this repo) with a short description and repro steps — mark the message as a security report.

Include, when possible:

- Chevron version (or commit SHA) and OS
- Impact (RCE, data read, package-sandbox escape, etc.)
- Minimal reproduction steps
- Whether the issue is in core, a bundled package, or a community package

### What to expect

This is a small / solo-maintained project. Targets (not SLAs):

| Stage | Target |
| ----- | ------ |
| Initial acknowledgement | Within **7 days** |
| Triage / severity assessment | Within **14 days** after acknowledgement |
| Fix or public mitigation note | Best effort; timing depends on severity and root cause |

We may ask for more detail, request a coordinated disclosure window, or decline reports that are out of scope (see below).

## Scope

**In scope (examples):**

- Main-process / IPC trust-boundary bypasses
- Escape from community package require restrictions when defaults are on
- Guest `<webview>` / package-worker isolation failures
- Path confinement failures (`atom://` / `chevron://`, FS IPC roots)
- Supply-chain issues in first-party or owned (`builtbygio/*`) code that we ship

**Out of scope / accepted residual risk (until Phase S):**

- Editor Chromium `sandbox: false` and Node-capable preload (documented product trade-off for hackable natives)
- Malicious **bundled** package code running with user privilege (install software carefully)
- Users who disable hardening (`CHEVRON_RESTRICT_PACKAGE_REQUIRES=0`, loose FS IPC, etc.)
- Unmaintained third-party Atom packages installed by the user from the registry
- Theoretical CVEs in transitive deps with no demonstrated attack path in Chevron

Background: [docs/security-threat-model.md](docs/security-threat-model.md), [docs/package-node-policy.md](docs/package-node-policy.md), [docs/security-phase-s.md](docs/security-phase-s.md).

## Safe harbor

We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, data destruction, and service disruption
- Do not exploit the issue beyond what is needed to demonstrate it
- Report findings privately and give us a reasonable window before public disclosure

Thank you for helping keep Chevron users safe.
