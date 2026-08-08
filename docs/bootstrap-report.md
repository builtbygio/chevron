# Bootstrap report (current)

**Status:** Use **`./script/bootstrap-modern`** only.  
**Supersedes:** the 2026-07 Atom/apm attempt log below is historical context only.

## Working path (2026-08+)

| Item | Value |
|------|--------|
| Entry | `./script/bootstrap-modern` then `./script/with-modern-env ./script/build --no-bootstrap` |
| Host Node | **20–24** (prefer **24** / `.nvmrc`) |
| Python | **3.11–3.13** (prefer **3.12** + `setuptools`) |
| App deps | host **npm** (`npm ci --ignore-scripts --legacy-peer-deps`) |
| Product packages | **cpm** (not classic apm) |
| Electron | `package.json` → `electronVersion` (currently 43.x) |
| Headers | `ATOM_ELECTRON_URL=https://www.electronjs.org/headers` |
| Patches | [bootstrap-patch-matrix.md](./bootstrap-patch-matrix.md) |
| Natives | hard-gated critical list (`script/lib/critical-natives.js`) |
| Modernization | [build-modernization.md](./build-modernization.md) |

### Shell recipe

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use                 # .nvmrc → 24

# Optional: source modern-env (Python shim + CXXFLAGS)
#   . script/lib/modern-env.sh

./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap
```

Install Python once: `brew install python@3.12 && python3.12 -m pip install setuptools`  
(or distro equivalent).

### CI

GitHub Actions (`.github/workflows/ci.yml`): Node 24, Python 3.12, five-platform bootstrap + build + smoke. Docs-only PRs skip the platform matrix.

### Overrides

| Env | Effect |
|-----|--------|
| `CHEVRON_FORCE_NATIVE_REBUILD=1` | Always rebuild natives |
| `CHEVRON_ALLOW_NATIVE_REBUILD_FAILURES=1` | Soft-fail critical natives (local debug only) |
| `CHEVRON_FORCE_MKSNAPSHOT=1` | Attempt custom startup snapshot on Electron 43+ |

---

## Historical attempt log (2026-07, apm era)

The following table documents early recovery work while apm/Node 12 was still in the bootstrap path. It is **not** the current procedure.

| # | Setup | Result | Failure |
|---|--------|--------|---------|
| 1–9 | Various Node/Python/apm combinations | Mixed | gyp `rU`, distutils, atom.io headers sunset, ABI skew |

Root causes then (still relevant as design constraints):

1. Host Node too new for old NAN without rebuild targeting Electron  
2. Python 3.12+ needs setuptools; 3.11+ needs gyp `rU` patch  
3. macOS may lack `python` binary (shim via modern-env)  
4. Electron headers must come from electronjs.org, not atom.io  

Current bootstrap addresses these via modern-env, host npm, ignore-scripts + modern node-gyp, and the patch matrix.
