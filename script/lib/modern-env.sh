#!/usr/bin/env bash
# Shared modern-toolchain environment for Chevron bootstrap/build on current macOS/Linux.
# Source this file:  . script/lib/modern-env.sh
# Or use:            script/with-modern-env <command...>
#
# Requirements (install once):
#   - nvm + Node 24 (matches Electron 43 host story):  nvm install 24 && nvm use 24
#     (accepted host range: Node 20–24; default pin is 24)
#   - Python 3.12 (CI preferred) or 3.13 / 3.11:
#       brew install python@3.12   (macOS)
#       # or: brew install python@3.13 / python@3.11
#   - For Python 3.12+: pip install setuptools  (provides distutils for node-gyp)
#   - python shim:    created automatically under ~/.local/bin/python
#   - Xcode CLT / build-essential for native modules
#
# Layering (do not conflate):
#   Host Node (here)  → script/*, CI, modern node-gyp for Electron rebuilds
#   apm Node 12       → package install via apm's bundled binary (until apm replaced)
#   Electron Node     → runtime only (already modern; not this file)

# Idempotent: safe to source multiple times
_chevron_modern_env_loaded=${_chevron_modern_env_loaded:-0}
if [ "$_chevron_modern_env_loaded" = "1" ]; then
  return 0 2>/dev/null || true
fi

# BASH_SOURCE is bash-only; zsh exposes the sourced path as $0.
_chevron_source="${BASH_SOURCE[0]:-$0}"
_chevron_repo_root="$(cd "$(dirname "$_chevron_source")/../.." && pwd)"

# Preferred host Node major (CHEVRON_NODE_MAJOR; ATOMNOVA_NODE_MAJOR still accepted).
_chevron_node_preferred="${CHEVRON_NODE_MAJOR:-${ATOMNOVA_NODE_MAJOR:-24}}"

# --- nvm / host Node (20–24; prefer 24 to align with Electron 43) ------------
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
elif [ -s "/usr/local/opt/nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "/usr/local/opt/nvm/nvm.sh"
elif [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "/opt/homebrew/opt/nvm/nvm.sh"
fi

if command -v nvm >/dev/null 2>&1; then
  # Prefer .nvmrc when present, then preferred major, then any installed 20–24.
  if [ -f "$_chevron_repo_root/.nvmrc" ]; then
    nvm use >/dev/null 2>&1 || true
  fi
  _node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
  if [ "$_node_major" -lt 20 ] || [ "$_node_major" -gt 24 ]; then
    nvm use "$_chevron_node_preferred" >/dev/null 2>&1 \
      || nvm use 24 >/dev/null 2>&1 \
      || nvm use 22 >/dev/null 2>&1 \
      || nvm use 20 >/dev/null 2>&1 \
      || true
  fi
fi

_node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$_node_major" -lt 20 ] || [ "$_node_major" -gt 24 ]; then
  echo "error: host Node must be 20.x–24.x (got $(node -v 2>/dev/null || echo none))." >&2
  echo "  nvm install $_chevron_node_preferred && nvm use $_chevron_node_preferred" >&2
  echo "  (apm still uses its bundled Node 12 for install; this is host tooling only.)" >&2
  return 1 2>/dev/null || exit 1
fi

# --- Python 3.12/3.13 (preferred) or 3.11 + unversioned `python` -------------
# CI pins 3.12. Prefer 3.12, then 3.13 (setuptools), then 3.11 (stdlib distutils).
# Cap at 3.13 by default — 3.14 stays out until explicitly requested (CHEVRON_PYTHON).
# Override with CHEVRON_PYTHON=/path/to/python3.x (ATOMNOVA_PYTHON still accepted).
_python=""
for _candidate in \
  "${CHEVRON_PYTHON:-}" \
  "${ATOMNOVA_PYTHON:-}" \
  /usr/local/bin/python3.12 \
  /opt/homebrew/bin/python3.12 \
  "$(command -v python3.12 2>/dev/null || true)" \
  /usr/local/bin/python3.13 \
  /opt/homebrew/bin/python3.13 \
  "$(command -v python3.13 2>/dev/null || true)" \
  /usr/local/bin/python3.11 \
  /opt/homebrew/bin/python3.11 \
  "$(command -v python3.11 2>/dev/null || true)" \
  "$(command -v python3 2>/dev/null || true)" \
  "$(command -v python 2>/dev/null || true)"; do
  # Skip empty / non-executable (Windows Git Bash: -x can fail on .exe; -f is enough)
  if [ -z "$_candidate" ]; then
    continue
  fi
  if [ -x "$_candidate" ] || [ -f "$_candidate" ]; then
    # Reject Windows Store python stub / wrong majors later via version check
    _python="$_candidate"
    break
  fi
done

if [ -z "$_python" ]; then
  echo "error: Python 3.12, 3.13, or 3.11 not found (required for node-gyp / native rebuilds)." >&2
  echo "  macOS:  brew install python@3.12" >&2
  echo "  Linux:  apt install python3.12 (or use pyenv/nvm-style pin)" >&2
  echo "  Windows: install Python 3.12 and ensure it is on PATH (CI: actions/setup-python)" >&2
  return 1 2>/dev/null || exit 1
fi

_python_version="$("$_python" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo unknown)"
_python_major="$("$_python" -c 'import sys; print(sys.version_info[0])' 2>/dev/null || echo 0)"
_python_minor="$("$_python" -c 'import sys; print(sys.version_info[1])' 2>/dev/null || echo 0)"

if [ "$_python_major" -ne 3 ] || [ "$_python_minor" -lt 11 ]; then
  echo "error: host Python must be 3.11+ (got $_python_version at $_python)." >&2
  echo "  brew install python@3.12" >&2
  return 1 2>/dev/null || exit 1
fi

# Refuse accidental Homebrew 3.14+ unless explicitly overridden via CHEVRON_PYTHON.
if [ -z "${CHEVRON_PYTHON:-}${ATOMNOVA_PYTHON:-}" ] && [ "$_python_minor" -ge 14 ]; then
  echo "error: Python $_python_version is too new for the supported host range (3.11–3.13)." >&2
  echo "  brew install python@3.12 && export CHEVRON_PYTHON=\$(command -v python3.12)" >&2
  echo "  (or set CHEVRON_PYTHON to force a specific interpreter)" >&2
  return 1 2>/dev/null || exit 1
fi

# Python 3.12+ removed stdlib distutils; setuptools provides the compatibility
# shim that node-gyp still imports. Fail early with an actionable message.
if [ "$_python_minor" -ge 12 ]; then
  if ! "$_python" -c 'import distutils' >/dev/null 2>&1; then
    echo "error: Python $_python_version has no distutils (removed from stdlib)." >&2
    echo "  Install setuptools for this interpreter (CI uses plain pip):" >&2
    echo "    \"$_python\" -m pip install setuptools" >&2
    echo "  On Homebrew (PEP 668 externally-managed):" >&2
    echo "    \"$_python\" -m pip install --break-system-packages setuptools" >&2
    return 1 2>/dev/null || exit 1
  fi
fi

# Always point the unversioned shim at the selected interpreter so old Makefiles
# (`env python`) and node-gyp discovery stay consistent with PYTHON/NODE_GYP_*.
# On Windows Git Bash, ln -sfn works; if not, fall back to a tiny wrapper script.
mkdir -p "${HOME:-$USERPROFILE}/.local/bin"
_chevron_python_shim="${HOME:-$USERPROFILE}/.local/bin/python"
if ln -sfn "$_python" "$_chevron_python_shim" 2>/dev/null; then
  :
else
  printf '#!/usr/bin/env bash\nexec "%s" "$@"\n' "$_python" >"$_chevron_python_shim"
  chmod +x "$_chevron_python_shim" 2>/dev/null || true
fi

# Prefer shim + Homebrew libexec (unversioned names) on PATH. Active major first.
export PATH="${HOME:-$USERPROFILE}/.local/bin:/usr/local/opt/python@3.12/libexec/bin:/opt/homebrew/opt/python@3.12/libexec/bin:/usr/local/opt/python@3.13/libexec/bin:/opt/homebrew/opt/python@3.13/libexec/bin:/usr/local/opt/python@3.11/libexec/bin:/opt/homebrew/opt/python@3.11/libexec/bin:$PATH"
export PYTHON="$_python"
export npm_config_python="$_python"
export NODE_GYP_FORCE_PYTHON="$_python"
# Avoid cp1252 UnicodeEncodeError on Windows console for bootstrap prints.
export PYTHONIOENCODING="${PYTHONIOENCODING:-utf-8}"
export PYTHONUTF8="${PYTHONUTF8:-1}"

# Windows: node-gyp / MSVC — prefer VS 2022 Build Tools when present.
# (GitHub windows-latest images already include them; this helps local builds.)
# Windows: leave msvs_version unset so node-gyp auto-detects via vswhere.
# Pinning 2022 fails on images that only ship VS 18/2025/2026.
case "$(uname -s 2>/dev/null)-${OS:-}" in
  MINGW*|MSYS*|CYGWIN*|*Windows_NT*)
    unset npm_config_msvs_version GYP_MSVS_VERSION 2>/dev/null || true
    # apm/npm invoke git-submodule; without GIT_EXEC_PATH, mingw git fails with
    # "git-sh-setup: file not found" under Git for Windows.
    for _git_exec in \
      "/c/Program Files/Git/mingw64/libexec/git-core" \
      "/mingw64/libexec/git-core" \
      "$(dirname "$(command -v git 2>/dev/null || true)")/../libexec/git-core"; do
      if [ -n "$_git_exec" ] && [ -f "$_git_exec/git-sh-setup" ]; then
        export GIT_EXEC_PATH="$_git_exec"
        # git-submodule does `. git-sh-setup` which resolves via PATH, not only GIT_EXEC_PATH.
        export PATH="$_git_exec:$PATH"
        break
      fi
    done
    ;;
esac

# --- C++ standard / toolchain for Node/Electron headers ----------------------
# Electron 20+ headers build with gnu++17, Electron 29+ with gnu++20; forcing
# an older -std via CXXFLAGS overrides gyp's own and breaks V8 headers.
# On Windows, MSVC does not accept -std=gnu++*; leave flags to node-gyp/msvs.
_electron_version="$(node -p "try{require(require('path').join(process.cwd(),'package.json')).electronVersion}catch(e){0}" 2>/dev/null || echo 0)"
# Prefer absolute path; cwd may not be repo root when sourced.
if [ -f "$_chevron_repo_root/package.json" ]; then
  _electron_version="$(node -p "try{require(process.argv[1]).electronVersion}catch(e){0}" "$_chevron_repo_root/package.json" 2>/dev/null || echo "$_electron_version")"
fi
_electron_major="${_electron_version%%.*}"

case "$(uname -s 2>/dev/null)-${OS:-}" in
  MINGW*|MSYS*|CYGWIN*|*Windows_NT*)
    # MSVC / clang-cl: do not inject gcc-style -std=
    :
    ;;
  *)
    _chevron_cxx_std="-std=c++17"
    if [ "${_electron_major:-0}" -ge 29 ] 2>/dev/null; then
      _chevron_cxx_std="-std=gnu++20"
    fi
    case " ${CXXFLAGS:-} " in
      *" -std="* | "-std="* ) ;;
      * ) export CXXFLAGS="${_chevron_cxx_std}${CXXFLAGS:+ $CXXFLAGS}" ;;
    esac
    export npm_config_cxxflags="${npm_config_cxxflags:-$_chevron_cxx_std}"
    ;;
esac

# Electron 40+ V8 headers need <source_location> (libc++ from Xcode 15).
# The CLT on this host is clang 14; select Xcode.app per-process instead.
if [ "${_electron_major:-0}" -ge 40 ] 2>/dev/null && [ -z "${DEVELOPER_DIR:-}" ] \
   && [ -d /Applications/Xcode.app/Contents/Developer ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

# git-utils' vendored (ancient) zlib defines `fdopen(fd,mode) NULL` on Mac;
# with Xcode 16+ header ordering that poisons the SDK's own fdopen prototype
# in <stdio.h> ("expected identifier or '('"). Pre-defining fdopen as itself
# makes zlib's `#ifndef fdopen` guard skip the broken macro.
if [ "$(uname)" = "Darwin" ]; then
  case " ${CFLAGS:-} " in
    *" -Dfdopen="* ) ;;
    * ) export CFLAGS="-Dfdopen=fdopen${CFLAGS:+ $CFLAGS}" ;;
  esac
fi

# --- Electron headers (atom.io download endpoint is dead) --------------------
export ATOM_ELECTRON_URL="${ATOM_ELECTRON_URL:-https://www.electronjs.org/headers}"
export ATOM_RESOURCE_PATH="${ATOM_RESOURCE_PATH:-$_chevron_repo_root}"

# --- git:// is dead on GitHub (2022); rewrite to https for spawned gits ------
# Env-based config (git ≥ 2.31) so we don't touch the user's global config.
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0="url.https://github.com/.insteadOf"
export GIT_CONFIG_VALUE_0="git://github.com/"

# --- Patch old node-gyp: open(..., 'rU') removed in Python 3.11 --------------
chevron_patch_node_gyp() {
  local root="${1:-$_chevron_repo_root}"
  # Use selected host python to edit files; do not depend on repo node_modules
  "$_python" - "$root" <<'PY'
import sys
from pathlib import Path

root = Path(sys.argv[1])
patched = 0
for path in root.rglob("input.py"):
    # Only touch node-gyp's gyp input module
    parts = path.parts
    if "node-gyp" not in parts or "gyp" not in parts:
        continue
    if path.name != "input.py":
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        continue
    new = text.replace("'rU'", "'r'").replace('"rU"', '"r"')
    if new != text:
        path.write_text(new, encoding="utf-8")
        patched += 1
        print(f"patched node-gyp rU->r: {path}")
    # Drop cached bytecode that may still contain 'rU'
    pycache = path.parent / "__pycache__"
    if pycache.is_dir():
        for pyc in pycache.glob("input*.pyc"):
            try:
                pyc.unlink()
            except OSError:
                pass
if patched:
    print(f"node-gyp patches applied: {patched}")
PY
}

export -f chevron_patch_node_gyp 2>/dev/null || true
# Back-compat alias for scripts that still call the AtomNova-era name.
atomnova_patch_node_gyp() { chevron_patch_node_gyp "$@"; }
export -f atomnova_patch_node_gyp 2>/dev/null || true

_chevron_modern_env_loaded=1

echo "Chevron modern env:"
echo "  Node:    $(node -v) ($(command -v node))"
echo "  Python:  $($PYTHON --version 2>&1) ($PYTHON)"
echo "  python:  $(command -v python) -> $(python --version 2>&1)"
echo "  CXXFLAGS: ${CXXFLAGS:-}"
echo "  ATOM_ELECTRON_URL: ${ATOM_ELECTRON_URL:-}"
echo "  ATOM_RESOURCE_PATH: ${ATOM_RESOURCE_PATH:-}"
