# Building and installing Chevron on Windows

**Status:** CI bootstrap + build + smoke + zip (x64)  
**Host toolchain:** Node **24** + Python **3.12** (+ `setuptools`) via `script/bootstrap-modern`  
**Runtime:** Electron 43  
**Shell:** Git Bash (or WSL for the bash scripts; CI uses Git Bash)

---

## Prerequisites

| Tool | Notes |
|------|--------|
| **Git for Windows** | Provides Git Bash used by `bootstrap-modern` / `with-modern-env` |
| **Node 24** | Host only; apm still uses bundled Node 12 |
| **Python 3.12** | + `pip install setuptools` (distutils for node-gyp) |
| **Visual Studio 2022** | “Desktop development with C++” / Build Tools (node-gyp natives) |

Optional: `nvm-windows` or fnm for Node 24.

---

## Quick start (from source)

In **Git Bash**:

```bash
git clone https://github.com/builtbygio/chevron.git
cd chevron

# Ensure Node 24 + Python 3.12 are on PATH
python -m pip install --user setuptools

./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap --compress-artifacts

# Smoke (opens a real window briefly)
node script/ci/smoke-test.js
```

**Do not** run stock `./script/bootstrap` on modern hosts — it exits with a redirect to `bootstrap-modern`.

### PowerShell / cmd note

`bootstrap-modern` and `with-modern-env` are bash scripts. From PowerShell:

```powershell
bash ./script/bootstrap-modern --ci
bash ./script/with-modern-env ./script/build --no-bootstrap
```

---

## Artifacts

After a successful Windows build under `out/`:

| Artifact | Description |
|----------|-------------|
| `Chevron/` or `Chevron x64/` | Unpacked Electron app (`chevron.exe`) |
| `chevron-x64-windows.zip` | Compressed app directory (`--compress-artifacts`) |

Squirrel installer (`--create-windows-installer`) is optional and not required for CI smoke.

### Run unpacked

```bat
out\Chevron x64\chevron.exe
```

(Exact folder name depends on arch; stable product folder is based on `productName`.)

---

## CI

GitHub Actions (`.github/workflows/ci.yml`):

| Job | Runner | What |
|-----|--------|------|
| `build-and-smoke-windows` | `windows-latest` (x64) | Bootstrap, build, zip, smoke |

Windows jobs upload packages as workflow artifacts (`chevron-windows-*`).

---

## Architecture layers (do not confuse)

| Layer | Role |
|-------|------|
| Host Node 24 | Bootstrap / build scripts / modern node-gyp |
| apm Node 12 | Package install (bundled binary) |
| Electron 43 | Running app |

---

## Packaging flags

```bash
./script/with-modern-env ./script/build --no-bootstrap \
  --compress-artifacts \
  --create-windows-installer   # optional Squirrel .exe / nupkg
```

| Flag | Output |
|------|--------|
| (default) | Unpacked app under `out/Chevron*` |
| `--compress-artifacts` | `.zip` in `out/` |
| `--create-windows-installer` | Squirrel installer (needs packaging deps) |

---

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| `invalid mode: 'rU'` | Use `bootstrap-modern`, not stock bootstrap |
| `spawnSync npm.cmd EINVAL` | Use current tree (npm/apm spawns use `shell:true` on Windows) |
| `MSBuild` / `node-gyp` failures | Install VS 2022 C++ workload; set `npm_config_msvs_version=2022` |
| Python not found in bash | `actions/setup-python` or add Python to PATH; `export CHEVRON_PYTHON=/c/Python312/python.exe` |
| Smoke cannot find `.exe` | Ensure build finished; look under `out/Chevron*` for `chevron.exe` |
| apm MODULE_VERSION mismatch | Re-run full `bootstrap-modern` |

---

*Windows CI targets x64 package-boot smoke; full editor CDP probe is preferred when available.*
