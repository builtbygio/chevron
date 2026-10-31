# Building and installing Chevron on Linux

**Status:** x64 CI (bootstrap, smoke, AppImage). Linux arm64 is not built.  
**Host toolchain:** Node **24** + **pnpm 11** + Python **3.12** (+ `setuptools`) via `script/bootstrap-modern`  
**Runtime:** Electron 43

---

## Quick start (from source)

```bash
# System packages (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y build-essential pkg-config \
  libx11-dev libxkbfile-dev libsecret-1-dev libxss-dev \
  libgtk-3-0 libnotify4 libnss3 libgbm1 libasound2 \
  git python3 python3-pip xvfb squashfs-tools

# Node 24 (nvm recommended)
nvm install 24 && nvm use 24
python3 -m pip install --user setuptools   # or: pip install setuptools

git clone https://github.com/builtbygio/chevron.git
cd chevron

./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap \
  --create-appimage

# Headless smoke (optional)
xvfb-run -a node script/ci/smoke-test.js
```

**Do not** run stock `./script/bootstrap` on modern hosts — it exits with a redirect to `bootstrap-modern`.

### Optional: Docker

Root `Dockerfile` is a **Linux build helper** (Ubuntu 24.04, Node 24, Python 3.12 + setuptools). Prefer a native host for day-to-day work; use the image when you need a clean reproducible environment:

```bash
docker build -t chevron-build .
docker run --rm -it -v "$PWD":/chevron -w /chevron chevron-build \
  bash -lc './script/bootstrap-modern && ./script/with-modern-env ./script/build --no-bootstrap'
```

---

## Artifacts

After a successful Linux build you typically get under `out/`:

| Artifact | Description |
|----------|-------------|
| `Chevron-linux-x64/` (or `arm64`) | Unpacked Electron app (run `./chevron`) |
| `chevron-<version>-x64.AppImage` | Portable AppImage (what CI and releases publish) |

### Run the AppImage

```bash
chmod +x out/chevron-*-x64.AppImage
./out/chevron-*-x64.AppImage
```

### Run from the unpacked tree

```bash
./out/Chevron-linux-x64/chevron
```

---

## CI

GitHub Actions (`.github/workflows/ci.yml`):

| Job | Runner | What |
|-----|--------|------|
| `build-and-smoke-linux` | `ubuntu-latest` (x64) | Bootstrap, build, xvfb smoke, **AppImage** |

CI is **Linux x64 only**. The job uploads `.AppImage` (`chevron-linux-x64`). There is no arm64 job. `.deb` / `.rpm` / tarball are not built in CI.

---

## Known Linux notes

### File watcher limits

If you see `Error: ENOSPC: System limit for number of file watchers reached`:

```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Headless / CI display

Smoke tests need a virtual framebuffer:

```bash
xvfb-run -a node script/ci/smoke-test.js
```

### Natives

`keytar` needs `libsecret-1-dev` at **build** time and `libsecret-1-0` / `gnome-keyring` at **run** time for credential storage.

### Architecture layers (do not confuse)

| Layer | Role |
|-------|------|
| Host Node 24 | Bootstrap / build scripts / modern node-gyp |
| apm Node 12 | Package install (bundled binary) |
| Electron 43 | Running app |

See `docs/process/toolchain-node-python-upgrade-plan.md` and `docs/reference/bootstrap-report.md`.

### arm64 and mksnapshot

CI does not build Linux arm64. A local arm64 build still hits this:

`electron-mksnapshot` **does not run on Linux arm64** (Electron only ships an
x64 host tool that can *cross-generate* arm64 snapshots). On native arm64
builders we:

1. Install script deps without the mksnapshot lifecycle script
2. Skip custom Atom startup-blob generation
3. Ship Electron’s **stock** V8 snapshots (app boots normally; slightly slower cold start)
4. Skip `minidump` symbol dumping (`dump_syms` is not shipped for `linux-arm64`)

To produce custom arm64 startup blobs you must run mksnapshot on an **x64**
Linux host with the `linux-arm64-x64` mksnapshot artifact — out of scope for
native arm64 CI.

### chrome-sandbox in CI / unpackaged runs

Unpackaged `out/Chevron-linux-*` builds cannot setuid `chrome-sandbox` without
root. The CI smoke test passes `--no-sandbox` when the helper is not
root-owned mode `4755`.

---

## Packaging flags

```bash
./script/with-modern-env ./script/build --no-bootstrap \
  --create-appimage
```

| Flag | Output |
|------|--------|
| (default) | Unpacked app under `out/Chevron-linux-*` |
| `--create-appimage` | `.AppImage` in `out/` (CI / releases) |
| `--create-debian-package` | `.deb` in `out/` (local optional; not in CI) |
| `--create-rpm-package` | `.rpm` (needs `rpmbuild`; local optional; not in CI) |
| `--compress-artifacts` | `.tar.gz` of the app dir (local optional; not in CI) |

---

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| `invalid mode: 'rU'` | Use `bootstrap-modern`, not stock bootstrap |
| keytar build fails | Install `libsecret-1-dev` |
| Smoke fails with display errors | Use `xvfb-run -a` |
| `ENOSPC` watchers | Raise `fs.inotify.max_user_watches` |
| apm MODULE_VERSION mismatch | Re-run full `bootstrap-modern` (apm natives rebuild under Node 12) |

---

*L1 = CI green + smoke · L2 = AppImage artifact. Linux CI is x64.*
