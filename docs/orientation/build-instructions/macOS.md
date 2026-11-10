# Building and installing Chevron on macOS

**Status:** Local builds. CI does not build macOS. Releases are Linux x64 only.  
**Host toolchain:** Node **24** + **pnpm 11** + Python **3.12** (+ `setuptools`) via `script/bootstrap-modern`  
**Runtime:** Electron 45.2.2

---

## Prerequisites

| Tool | Notes |
|------|--------|
| **Xcode CLT** | `xcode-select --install` (Electron 40+ may need full Xcode 15+) |
| **Node 24** | nvm recommended: `nvm install 24 && nvm use 24` |
| **pnpm 11** | App deps: `corepack enable` (packageManager is `pnpm@11.22.0`) |
| **Python 3.12** | `brew install python@3.12` + `pip install setuptools` |

Native arch is used as-is: run bootstrap/build on an Apple Silicon Mac for arm64, or on Intel (or under Rosetta) for x64. A local build is single-arch. A universal bundle is merged locally with `./script/mac-universal` when both arch builds exist (see [packaging.md](../../reference/packaging.md#macos-universal-bundle)). CI does not build macOS.

---

## Quick start (from source)

```bash
git clone https://github.com/builtbygio/chevron.git
cd chevron

./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap --compress-artifacts

# Smoke
node script/ci/smoke-test.js

open out/Chevron.app
```

**Do not** run stock `./script/bootstrap` on modern hosts.

---

## Artifacts

| Artifact | Description |
|----------|-------------|
| `out/Chevron.app` | App bundle (architecture matches the host) |
| `chevron-mac-x64.zip` / `chevron-mac-arm64.zip` | Compressed app (`--compress-artifacts`; arch matches the host) |

---

## CI

GitHub Actions no longer runs macOS jobs. Releases are Linux x64 only. Local builds on macOS still work with the steps above.

---

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| `invalid mode: 'rU'` | Use `bootstrap-modern` |
| clang / V8 header errors | Use Xcode 15+ (`export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`) |
| Wrong arch binary | Rebuild on the target machine; packager uses host arch |
