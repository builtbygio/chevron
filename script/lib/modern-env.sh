#!/usr/bin/env bash
# Shared modern-toolchain environment for AtomNova bootstrap/build on current macOS/Linux.
# Source this file:  . script/lib/modern-env.sh
# Or use:            script/with-modern-env <command...>
#
# Requirements (install once):
#   - nvm + Node 16:  nvm install 16 && nvm use 16
#   - Python 3.11:    brew install python@3.11   (macOS)
#   - python shim:    ln -sfn "$(command -v python3.11)" ~/.local/bin/python
#   - Xcode CLT / build-essential for native modules

# Idempotent: safe to source multiple times
_atomnova_modern_env_loaded=${_atomnova_modern_env_loaded:-0}
if [ "$_atomnova_modern_env_loaded" = "1" ]; then
  return 0 2>/dev/null || true
fi

_atomnova_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# --- nvm / Node 16 -----------------------------------------------------------
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
  nvm use 16 >/dev/null 2>&1 || nvm use 16
fi

_node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$_node_major" -lt 14 ] || [ "$_node_major" -ge 18 ]; then
  echo "error: host Node must be 14.x–16.x (got $(node -v 2>/dev/null || echo none))." >&2
  echo "  nvm install 16 && nvm use 16" >&2
  return 1 2>/dev/null || exit 1
fi

# --- Python 3.11 + unversioned `python` --------------------------------------
_python311=""
for _candidate in \
  "${ATOMNOVA_PYTHON:-}" \
  /usr/local/bin/python3.11 \
  /opt/homebrew/bin/python3.11 \
  "$(command -v python3.11 2>/dev/null || true)"; do
  if [ -n "$_candidate" ] && [ -x "$_candidate" ]; then
    _python311="$_candidate"
    break
  fi
done

if [ -z "$_python311" ]; then
  echo "error: Python 3.11 not found (required; Python 3.12+ removed distutils for old node-gyp)." >&2
  echo "  brew install python@3.11" >&2
  return 1 2>/dev/null || exit 1
fi

mkdir -p "$HOME/.local/bin"
if [ ! -e "$HOME/.local/bin/python" ]; then
  ln -sfn "$_python311" "$HOME/.local/bin/python"
fi

# Prefer shim + Homebrew python@3.11 libexec (unversioned names) on PATH
export PATH="$HOME/.local/bin:/usr/local/opt/python@3.11/libexec/bin:/opt/homebrew/opt/python@3.11/libexec/bin:$PATH"
export PYTHON="$_python311"
export npm_config_python="$_python311"
export NODE_GYP_FORCE_PYTHON="$_python311"

# --- C++ standard / toolchain for Node/Electron headers ----------------------
# Electron 20+ headers build with gnu++17, Electron 29+ with gnu++20; forcing
# an older -std via CXXFLAGS overrides gyp's own and breaks V8 headers.
_electron_version="$(node -p "require('$_atomnova_repo_root/package.json').electronVersion" 2>/dev/null || echo 0)"
_electron_major="${_electron_version%%.*}"

_atomnova_cxx_std="-std=c++17"
if [ "${_electron_major:-0}" -ge 29 ] 2>/dev/null; then
  _atomnova_cxx_std="-std=gnu++20"
fi
case " ${CXXFLAGS:-} " in
  *" -std="* | "-std="* ) ;;
  * ) export CXXFLAGS="${_atomnova_cxx_std}${CXXFLAGS:+ $CXXFLAGS}" ;;
esac
export npm_config_cxxflags="${npm_config_cxxflags:-$_atomnova_cxx_std}"

# Electron 40+ V8 headers need <source_location> (libc++ from Xcode 15).
# The CLT on this host is clang 14; select Xcode.app per-process instead.
if [ "${_electron_major:-0}" -ge 40 ] 2>/dev/null && [ -z "${DEVELOPER_DIR:-}" ] \
   && [ -d /Applications/Xcode.app/Contents/Developer ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

# --- Electron headers (atom.io download endpoint is dead) --------------------
export ATOM_ELECTRON_URL="${ATOM_ELECTRON_URL:-https://www.electronjs.org/headers}"
export ATOM_RESOURCE_PATH="${ATOM_RESOURCE_PATH:-$_atomnova_repo_root}"

# --- git:// is dead on GitHub (2022); rewrite to https for spawned gits ------
# Env-based config (git ≥ 2.31) so we don't touch the user's global config.
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0="url.https://github.com/.insteadOf"
export GIT_CONFIG_VALUE_0="git://github.com/"

# --- Patch old node-gyp: open(..., 'rU') removed in Python 3.11 --------------
atomnova_patch_node_gyp() {
  local root="${1:-$_atomnova_repo_root}"
  # Use host python3.11 to edit files; do not depend on repo node_modules
  "$_python311" - "$root" <<'PY'
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
        print(f"patched node-gyp rU→r: {path}")
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

export -f atomnova_patch_node_gyp 2>/dev/null || true

_atomnova_modern_env_loaded=1

echo "AtomNova modern env:"
echo "  Node:    $(node -v) ($(command -v node))"
echo "  Python:  $($PYTHON --version 2>&1) ($PYTHON)"
echo "  python:  $(command -v python) → $(python --version 2>&1)"
echo "  CXXFLAGS: $CXXFLAGS"
echo "  ATOM_ELECTRON_URL: $ATOM_ELECTRON_URL"
echo "  ATOM_RESOURCE_PATH: $ATOM_RESOURCE_PATH"
