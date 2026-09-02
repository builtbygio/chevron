'use strict';

/**
 * Packaging keeps the dependency versions pnpm resolved.
 *
 * pnpm nests a dependency wherever the hoisted copy does not satisfy a
 * package's range; dropping those nested copies fails silently and only in the
 * packaged app. Asserts the general property: every dependency a shipped
 * package declares resolves inside its range.
 *
 * Run: node --test script/ci/nested-modules-preserved.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'out', 'app');
const DEV_MODULES = path.join(ROOT, 'node_modules');
const semver = require(path.join(DEV_MODULES, 'semver'));

// Whether anything that actually ships inside `pkgDir` requires `dep`.
//
// The range check below is a proxy for the real property: that resolution
// cannot hand a shipped file a version it was not written against. When a
// package's nested copy is dropped because the only file requiring it is
// itself excluded from the installer, the proxy fails while the real property
// holds -- season/lib/csonc.js is the case that forced this, the only requirer
// of yargs in a package whose library half never touches it.
//
// So rather than an allowlist, ask the shipped tree directly. Anything that
// starts requiring the dep for real fails the check again, which is the whole
// point of the guard.
function shippedCodeRequires(pkgDir, dep) {
  const pattern = new RegExp(
    `require\\(\\s*['"]${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/|['"])`
  );
  let found = false;
  const walk = dir => {
    if (found) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      return;
    }
    for (const entry of entries) {
      if (found) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
      } else if (/\.(js|ts|json)$/.test(entry.name) && entry.name !== 'package.json') {
        try {
          if (pattern.test(fs.readFileSync(full, 'utf8'))) found = true;
        } catch (error) {
          // unreadable file proves nothing; keep looking
        }
      }
    }
  };
  walk(pkgDir);
  return found;
}

function readManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch (error) {
    return null;
  }
}

describe('packaging preserves resolved versions', () => {
  it('the build step exists and is not a list of individual casualties', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'script', 'lib', 'copy-assets.js'),
      'utf8'
    );
    assert.match(
      src,
      /preserveNestedModules\(\)/,
      'copy-assets must preserve nested modules generally'
    );
  });

  const describeApp = fs.existsSync(APP) ? describe : describe.skip;

  describeApp('in the built app', () => {
    it('every declared dependency resolves inside its range', () => {
      const appModules = path.join(APP, 'node_modules');
      const offenders = [];

      for (const name of fs.readdirSync(DEV_MODULES)) {
        if (name.startsWith('.')) continue;
        const nestedRoot = path.join(DEV_MODULES, name, 'node_modules');
        let nested;
        try {
          if (!fs.statSync(nestedRoot).isDirectory()) continue;
          nested = fs.readdirSync(nestedRoot).filter(e => !e.startsWith('.'));
        } catch (error) {
          continue;
        }

        // Only packages that actually ship.
        if (!fs.existsSync(path.join(appModules, name))) continue;
        const manifest = readManifest(path.join(DEV_MODULES, name));
        if (!manifest) continue;
        const declared = manifest.dependencies || {};

        for (const dep of nested) {
          const range = declared[dep];
          if (!range) continue;
          // Nested copy present in the app: correct by construction.
          if (fs.existsSync(path.join(appModules, name, 'node_modules', dep))) {
            continue;
          }
          const hoisted = readManifest(path.join(appModules, dep));
          if (!hoisted || !hoisted.version) continue;
          let satisfied = true;
          try {
            satisfied = semver.satisfies(hoisted.version, range);
          } catch (error) {
            continue;
          }
          if (!satisfied) {
            // Unsatisfiable only matters if something shipped can reach it.
            if (!shippedCodeRequires(path.join(appModules, name), dep)) continue;
            offenders.push(
              `${name} declares ${dep}@${range} and would get ${hoisted.version}`
            );
          }
        }
      }

      assert.deepEqual(
        offenders,
        [],
        'these resolve to a version outside the declared range, which is how ' +
          'markdown-preview broke in shipped builds while working in dev:\n  ' +
          offenders.join('\n  ')
      );
    });

    it('the case that surfaced this stays fixed', () => {
      // htmlparser2 needs entities ^7; the hoisted copy is 4.x, whose exports
      // map has ./lib/decode.js and not ./decode.
      const nested = path.join(
        APP, 'node_modules', 'htmlparser2', 'node_modules', 'entities', 'package.json'
      );
      assert.ok(fs.existsSync(nested), 'entities must stay nested under htmlparser2');
      const version = JSON.parse(fs.readFileSync(nested, 'utf8')).version;
      assert.ok(
        semver.satisfies(version, '^7.0.0'),
        `expected entities ^7 under htmlparser2, found ${version}`
      );
    });
  });
});

/**
 * The reachability escape hatch is narrow on purpose: a check that silently
 * returned false for everything would disarm the guard above without failing.
 */
describe('the reachability check actually detects requires', () => {
  const APP_ = path.join(ROOT, 'out', 'app');
  const describeApp = fs.existsSync(APP_) ? describe : describe.skip;

  describeApp('against the built app', () => {
    it('finds a require that is really there', () => {
      // first-mate genuinely requires season; the check must say so.
      const firstMate = path.join(APP_, 'node_modules', 'first-mate');
      if (!fs.existsSync(firstMate)) return;
      assert.ok(
        shippedCodeRequires(firstMate, 'season'),
        'first-mate requires season in lib/grammar-registry.js; a check that ' +
          'misses this would let the guard pass on anything'
      );
    });

    it('does not invent one that is not', () => {
      const firstMate = path.join(APP_, 'node_modules', 'first-mate');
      if (!fs.existsSync(firstMate)) return;
      assert.ok(
        !shippedCodeRequires(firstMate, 'this-package-does-not-exist'),
        'the check must not match arbitrary names'
      );
    });

    it('season ships its library and no requirer of yargs', () => {
      const season = path.join(APP_, 'node_modules', 'season');
      if (!fs.existsSync(season)) return;
      assert.ok(
        fs.existsSync(path.join(season, 'lib', 'cson.js')),
        'the library half must still ship'
      );
      assert.ok(
        !shippedCodeRequires(season, 'yargs'),
        'if something in the shipped season starts requiring yargs, the ' +
          'nested copy has to come back'
      );
    });
  });
});
