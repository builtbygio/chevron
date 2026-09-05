#!/usr/bin/env bash
#
# Restore vendored packages' spec/ directories from upstream.
#
# The packages were vendored from published npm tarballs, which exclude spec/
# via files/.npmignore, so the specs never arrived. See
# docs/process/test-runner-migration.md.
#
# Source of truth is atom/<pkg>: the builtbygio/<pkg> repositories named in the
# vendored manifests do not exist, and Chevron's fork versions are ahead of
# upstream's last release, so a v<vendored-version> tag never matches. This
# takes the highest upstream tag at or below the vendored version, and falls
# back to the default branch.
#
# Usage:  script/restore-package-specs.sh [package ...]
#         script/restore-package-specs.sh --list
#
# Re-runnable: a package that already has spec/ is left alone.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh is required (it authenticates; plain git clone has no credentials in CI)" >&2
  exit 1
fi

missing_packages() {
  node -e '
    const fs = require("fs");
    const now = require("./package.json");
    for (const p of Object.keys(now.packageDependencies).sort()) {
      if (["spec", "test"].some(d => fs.existsSync(`packages/${p}/${d}`))) continue;
      console.log(p);
    }'
}

vendored_version() {
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    try {
      console.log(JSON.parse(fs.readFileSync(`packages/${p}/package.json`)).version || "");
    } catch (_) { console.log(""); }' "$1"
}

# Highest tag at or below the vendored version, by sort -V.
best_tag() {
  local pkg="$1" version="$2"
  gh api "repos/atom/$pkg/tags?per_page=100" --jq '.[].name' 2>/dev/null |
    sed 's/^v//' |
    { [ -n "$version" ] && awk -v v="$version" '$0 == v { print; exit } { print }' || cat; } |
    sort -V |
    awk -v v="${version:-999999}" '$0 <= v' |
    tail -1
}

restore_one() {
  local pkg="$1"
  if [ -d "packages/$pkg/spec" ] || [ -d "packages/$pkg/test" ]; then
    printf '%-30s %s\n' "$pkg" "already present"
    return 0
  fi

  # No pipeline here on purpose: with pipefail, `gh | head -1` kills gh with
  # SIGPIPE and every repository reads as missing.
  if ! gh api "repos/atom/$pkg" --jq .id >/dev/null 2>&1; then
    printf '%-30s %s\n' "$pkg" "no upstream spec (no atom/$pkg)"
    return 0
  fi

  # A package that declares its own runner does not join the Jasmine nightly,
  # and atom-mocha-test-runner is itself an ES module this runner cannot load.
  local runner
  runner="$(node -e '
    const fs = require("fs");
    try {
      const j = JSON.parse(fs.readFileSync(`packages/${process.argv[1]}/package.json`));
      process.stdout.write(j.chevronTestRunner || j.atomTestRunner || "");
    } catch (_) { process.stdout.write(""); }
  ' "$pkg")"
  if [ -n "$runner" ]; then
    printf '%-30s %s\n' "$pkg" "skipped (declares testRunner: $runner)"
    return 0
  fi

  local version tag ref label tmp
  version="$(vendored_version "$pkg")"
  tag="$(best_tag "$pkg" "$version")"
  if [ -n "$tag" ]; then
    ref="v$tag"
    label="restored (atom v$tag)"
  else
    ref="$(gh api "repos/atom/$pkg" --jq .default_branch 2>/dev/null)"
    label="restored (atom default branch)"
  fi

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  if ! gh api "repos/atom/$pkg/tarball/$ref" > "$tmp/src.tgz" 2>/dev/null; then
    printf '%-30s %s\n' "$pkg" "no upstream spec (fetch failed)"
    return 0
  fi
  tar -xzf "$tmp/src.tgz" -C "$tmp" 2>/dev/null || true
  local extracted
  extracted="$(find "$tmp" -maxdepth 1 -mindepth 1 -type d | head -1)"
  # Upstream packages use spec/ or test/ — command-palette uses test/, and
  # looking only for spec/ reported it as having none.
  local srcdir=""
  for candidate in spec test; do
    if [ -n "$extracted" ] && [ -d "$extracted/$candidate" ]; then
      srcdir="$extracted/$candidate"
      break
    fi
  done
  if [ -z "$srcdir" ]; then
    printf '%-30s %s\n' "$pkg" "no upstream spec"
    return 0
  fi

  # Only the tests. Never lib/ or package.json: the vendored copies are ours.
  cp -R "$srcdir" "packages/$pkg/spec"

  # CoffeeScript is not allowed in owned packages (PR 23), and the repo has a
  # gate for it. Upstream Atom specs are partly CoffeeScript, so drop those;
  # a package whose specs are all CoffeeScript has nothing usable to restore.
  local coffee js
  coffee="$(find "packages/$pkg/spec" -name '*.coffee' | wc -l | tr -d ' ')"
  js="$(find "packages/$pkg/spec" -name '*.js' | wc -l | tr -d ' ')"
  if [ "$coffee" -gt 0 ]; then
    find "packages/$pkg/spec" -name '*.coffee' -delete
  fi
  if [ "$js" -eq 0 ]; then
    rm -rf "packages/$pkg/spec"
    printf '%-30s %s\n' "$pkg" "no usable spec (CoffeeScript only, $coffee files)"
    return 0
  fi

  # Upstream spec helpers are ES modules behind a /** @babel */ pragma. This
  # runner does not transpile them, and one unloadable helper fails the whole
  # suite, so they are rewritten to CommonJS on the way in.
  local converted=0
  while IFS= read -r esm; do
    [ -n "$esm" ] || continue
    node -e '
      const fs = require("fs");
      const file = process.argv[1];
      let src = fs.readFileSync(file, "utf8");
      const names = [];
      src = src.replace(/^export\s+(async\s+)?function\s+([A-Za-z0-9_$]+)/gm, (m, isAsync, name) => {
        names.push(name);
        return `${isAsync || ""}function ${name}`;
      });
      src = src.replace(/^\/\*\*\s*@babel\s*\*\/\s*\n/m, "");
      if (names.length) {
        src += `\nmodule.exports = Object.assign(module.exports || {}, { ${names.join(", ")} });\n`;
      }
      fs.writeFileSync(file, src);
    ' "$esm"
    converted=$((converted + 1))
  done <<< "$(grep -rl '^export ' "packages/$pkg/spec" 2>/dev/null)"

  # require('atom') is the upstream module name. The global `atom` is aliased
  # by the spec runner, but the module is not — it is `chevron` here.
  local renamed
  renamed="$(grep -rl "require('atom')\|require(\"atom\")" "packages/$pkg/spec" 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$renamed" -gt 0 ]; then
    grep -rl "require('atom')\|require(\"atom\")" "packages/$pkg/spec" 2>/dev/null |
      while IFS= read -r f; do
        [ -n "$f" ] || continue
        sed -i "s/require('atom')/require('chevron')/g; s/require(\"atom\")/require(\"chevron\")/g" "$f"
      done
  fi

  if [ "$coffee" -gt 0 ]; then
    label="$label, $js js kept, $coffee coffee skipped"
  fi
  if [ "$renamed" -gt 0 ]; then
    label="$label, $renamed require('atom') rewritten"
  fi
  if [ "$converted" -gt 0 ]; then
    label="$label, $converted esm helper(s) converted"
  fi
  printf '%-30s %s\n' "$pkg" "$label"
}

if [ "${1:-}" = "--list" ]; then
  missing_packages
  exit 0
fi

if [ "$#" -gt 0 ]; then
  for pkg in "$@"; do restore_one "$pkg"; done
else
  while read -r pkg; do restore_one "$pkg"; done < <(missing_packages)
fi
