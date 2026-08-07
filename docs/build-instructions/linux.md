# Building and installing Chevron on Linux

**Status:** L1–L3 support (bootstrap, CI smoke, deb/tar packages, arm64 CI)  
**Host toolchain:** Node **24** + Python **3.12** (+ `setuptools`) via `script/bootstrap-modern`  
**Runtime:** Electron 43

---

## Quick start (from source)

```bash
# System packages (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y build-essential pkg-config \
  libx11-dev libxkbfile-dev libsecret-1-dev libxss-dev \
  libgtk-3-0 libnotify4 libnss3 libgbm1 libasound2 \
  git python3 python3-pip xvfb fakeroot dpkg-dev

# Node 24 (nvm recommended)
nvm install 24 && nvm use 24
python3 -m pip install --user setuptools   # or: pip install setuptools

git clone https://github.com/builtbygio/chevron.git
cd chevron

./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap \
  --create-debian-package \
  --compress-artifacts

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
| `chevron_<version>_amd64.deb` | Debian/Ubuntu package |
| `chevron-amd64.tar.gz` | Compressed app directory |
| `chevron.<arch>.rpm` | Fedora/RHEL (`rpmbuild`; required in CI) |

### Install `.deb` (Ubuntu/Debian)

```bash
sudo apt install ./out/chevron_*_amd64.deb
# or:
sudo dpkg -i ./out/chevron_*_amd64.deb
sudo apt-get install -f   # if dependencies missing
```

### Run from tarball

```bash
tar -xzf out/chevron-amd64.tar.gz
./Chevron-linux-x64/chevron
```

---

## CI

GitHub Actions (`.github/workflows/ci.yml`):

| Job | Runner | What |
|-----|--------|------|
| `build-and-smoke-macos` | `macos-15-intel` + `macos-15` (arm64) | Bootstrap, build, zip, smoke |
| `build-and-smoke-linux` | `ubuntu-latest` (x64) | Bootstrap, build, xvfb smoke, **deb + tar + rpm** |
| `build-and-smoke-linux-arm64` | `ubuntu-24.04-arm` | Bootstrap/build hard-gated; **smoke soft-gated** (Xvfb flakes) |
| `build-and-smoke-windows` | `windows-latest` (x64) | Bootstrap, build, zip, smoke |

Linux jobs upload **packages only** (`.deb` / `.tar.gz` / `.rpm`) as workflow artifacts (`chevron-linux-*`). RPM is a required artifact on both arches (needs `rpm` / `rpmbuild` from apt).

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

See `docs/toolchain-node-python-upgrade-plan.md` and `docs/bootstrap-report.md`.

### arm64 and mksnapshot

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
root-owned mode `4755`. Installed `.deb` packages set the correct permissions
on `/usr/share/chevron/chrome-sandbox`.

---

## Packaging flags

```bash
./script/with-modern-env ./script/build --no-bootstrap \
  --create-debian-package \
  --create-rpm-package \
  --compress-artifacts
```

| Flag | Output |
|------|--------|
| (default) | Unpacked app under `out/Chevron-linux-*` |
| `--create-debian-package` | `.deb` in `out/` |
| `--create-rpm-package` | `.rpm` (needs `rpmbuild`) |
| `--compress-artifacts` | `.tar.gz` of the app dir |

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

*L1 = CI green + smoke · L2 = deb/tar artifacts · L3 = arm64 CI + docs/branding*
