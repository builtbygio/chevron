# Chevron security threat model

**Status:** living doc (Electron BP complete as of 0.6.0; **Phase S Option C** as of close-out)  
**Related:** [electron-best-practices-plan.md](../process/electron-best-practices-plan.md) (closed), [security-phase-s-decision.md](../decisions/security-phase-s-decision.md), [package-node-policy.md](./package-node-policy.md), [security-phase-n.md](../process/security-phase-n.md)

## Goals

1. Protect the user’s machine and data from **malicious or compromised packages** and from **hostile web content** in previews/guests.
2. Keep a usable product: core editing, bundled packages, and git integration continue to work.
3. Prefer **default-secure** knobs; expert escape hatches stay available via env/config.

## Trust tiers

| Tier | Who | Privilege | Notes |
|------|-----|-----------|--------|
| **T0 Trusted** | Main process, core `src/`, `static/preload` boot | Full Node, shell, protocols | Attack surface minimized by IPC allowlists |
| **T1 Bundled** | Ship-in packages (github, tree-view, settings-view, …) | Preload Node today; prefer Atom APIs / IPC | Owned forks under `builtbygio/*` + in-repo `packages/*` |
| **T2 Community** | `~/.atom/packages`, `~/.chevron/packages` | **No privileged `require` by default** | `core.restrictCommunityPackageRequires` / `CHEVRON_RESTRICT_PACKAGE_REQUIRES` |
| **Untrusted** | Guest `<webview>` content, remote http(s) | No Node, sandboxed, scheme/path limits | N3/N4 + P2.4 file roots |

## Primary threats

| Threat | Mitigations |
|--------|-------------|
| Community package runs `child_process` / raw `fs` / `electron` | Default-on require restrict (P1.2); FS IPC roots (P2.1) |
| Community package loads arbitrary `.node` / keytar / superstring | Native addon + `.node` block (Phase S1.0) |
| Path traversal via `chevron://` | Path confinement (P0.1). The `atom://` alias was removed in Wave 4, so that scheme no longer reaches the resolver |
| Renderer drives arbitrary `BrowserWindow` methods | Package-worker-only IPC allowlist (P0.2) |
| Cross-webContents message injection | Manager↔worker / self-only `atom-wc-send` (P0.3) |
| Symlink in a project points out of it | FS IPC compares the path with its symlinks followed, not as it was spelled (2026-09-05) |
| Guest opens `file:///etc/passwd` | Guest file: roots (P2.4) |
| `shell.openExternal('file://…')` | Scheme allowlist http/https/mailto |
| Invalid TLS accepted | `certificate-error` → deny (P3.4) |
| Tampered asar / NODE_OPTIONS | Electron fuses on package (P3.2) |

## Explicit non-goals (Phase S Option C)

- Editor Chromium `sandbox: true` — **declined** under Option C (hot-path natives in preload; see [security-phase-s-decision.md](../decisions/security-phase-s-decision.md))
- Zero Node for **bundled** packages (github **git workers** use utilityProcess; other T1 may still use preload Node)
- Full Atom package API compatibility for packages that require unrestricted Node

## Escape hatches (expert)

| Knob | Effect |
|------|--------|
| `CHEVRON_RESTRICT_PACKAGE_REQUIRES=0` | Allow community privileged requires |
| `core.restrictCommunityPackageRequires: false` | Same via config (main sets env at boot) |
| `CHEVRON_FS_IPC_STRICT=0` / `core.fsIpcStrict: false` | Allow FS IPC outside project/home/temp roots |
| `CHEVRON_EXPERIMENTAL_WEB_FEATURES=1` / `core.enableExperimentalWebFeatures` | Re-enable experimental Chromium features |
| `CHEVRON_FORCE_MKSNAPSHOT=1` | Retry custom V8 startup snapshot on Electron ≥43 |
| `CHEVRON_ALLOW_PACKAGE_WORKER_BROWSERWINDOW=1` | **Ignored.** Node BrowserWindow git workers were removed. |

## FS IPC roots follow symlinks

The roots check used to compare the path as it was spelled. A symlink inside a
project is spelled inside the project and lands wherever it points, so the
boundary was open in both directions. Measured in the packaged app:

```
<project>/link-to-outside -> <somewhere else>

read  <project>/link-to-outside/secret.txt   → returned its contents
write <project>/link-to-outside/new.txt      → created the file outside
```

Both are refused now. Three details the fix has to get right:

- **The file being created has no realpath.** The deepest existing ancestor is
  resolved and the missing tail put back — the directory a file lands in is
  what decides where it lands.
- **A dangling symlink still says where a write would go**, and writing
  through one creates the file it points at. `realpathSync` gives up on those,
  so the link is read directly rather than falling back to the spelled path.
- **The roots are resolved too.** `/var` is a symlink to `/private/var` on
  macOS, so `ATOM_HOME` and the temp directory both arrive symlinked; resolving
  the path but not the root would deny every one of them.

A symlink that stays inside the project is unaffected, which is the common
case (`node_modules` links, a checkout linked into another).

This is not proof against an attacker **racing** the check by swapping a
symlink between the check and the open; that needs `O_NOFOLLOW` at the open
itself. It closes the case that matters in practice: a repository that
contains a symlink.

Gate: `script/ci/fs-ipc-roots.test.js`.

## Residual risk

A **bundled** package bug or a user who disables restrict still yields full user-equivalent code execution in the editor preload. Treat package installs as software installs; prefer Pulsar/cpm sources you trust.
