# Building and installing Chevron on macOS

**Status:** CI for **Intel (x64)** and **Apple Silicon (arm64)**  
**Host toolchain:** Node **24** + Python **3.12** (+ `setuptools`) via `script/bootstrap-modern`  
**Runtime:** Electron 43

---

## Prerequisites

| Tool | Notes |
|------|--------|
| **Xcode CLT** | `xcode-select --install` (Electron 40+ may need full Xcode 15+) |
| **Node 24** | nvm recommended: `nvm install 24 && nvm use 24` |
| **Python 3.12** | `brew install python@3.12` + `pip install setuptools` |

Native arch is used as-is: run bootstrap/build on an Apple Silicon Mac for arm64, or on Intel (or under Rosetta) for x64. CI builds both separately.

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

| Job matrix | Runner | Arch |
|------------|--------|------|
| `build-and-smoke-macos` | `macos-15-intel` | x64 (Intel) |
| `build-and-smoke-macos` | `macos-15` | arm64 (Apple Silicon) |

Artifacts: `chevron-macos-x64` / `chevron-macos-arm64`.

---

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| `invalid mode: 'rU'` | Use `bootstrap-modern` |
| clang / V8 header errors | Use Xcode 15+ (`export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`) |
| Wrong arch binary | Rebuild on the target machine; packager uses host arch |
