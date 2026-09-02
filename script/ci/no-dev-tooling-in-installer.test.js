'use strict';

/**
 * Lint, test and build tooling is not shipped to users.
 *
 * The root manifest has no devDependencies to separate the editor's
 * dependencies from the repository's, and copy-assets copies every top-level
 * node_modules entry. The exclusion list in include-path-in-packaged-app.js is
 * named rather than derived; this does the cheap half of verifying it
 * continuously -- nothing in the shipped tree may require one by name.
 *
 * Run: node --test script/ci/no-dev-tooling-in-installer.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'out', 'app');

function excludedNames() {
  const src = fs.readFileSync(
    path.join(ROOT, 'script', 'lib', 'include-path-in-packaged-app.js'),
    'utf8'
  );
  const block = src.match(/for \(const devTool of \[([\s\S]*?)\]\)/);
  assert.ok(block, 'the dev-tooling exclusion list must still be a literal');
  return [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

describe('no dev tooling in the installer', () => {
  const names = excludedNames();

  it('the list is non-empty and each entry is a real package', () => {
    assert.ok(names.length >= 10, `expected the dev-tooling list, got ${names.length}`);
    for (const name of names) {
      assert.ok(
        fs.existsSync(path.join(ROOT, 'node_modules', name)),
        `${name} is excluded but not installed; drop it from the list`
      );
    }
  });

  it('nothing in core requires them', () => {
    const offenders = [];
    const scan = dir => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (error) {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') scan(full);
          continue;
        }
        if (!/\.(js|ts)$/.test(entry.name)) continue;
        const source = fs.readFileSync(full, 'utf8');
        for (const name of names) {
          const pattern = new RegExp(
            `require\\(\\s*['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/|['"])`
          );
          if (pattern.test(source)) {
            offenders.push(`${path.relative(ROOT, full)} requires ${name}`);
          }
        }
      }
    };
    scan(path.join(ROOT, 'src'));
    scan(path.join(ROOT, 'static'));
    assert.deepEqual(offenders, [], offenders.join('\n  '));
  });

  it('no bundled package requires them', () => {
    const packages = path.join(ROOT, 'packages');
    const offenders = [];
    for (const pkg of fs.readdirSync(packages)) {
      const lib = path.join(packages, pkg, 'lib');
      let files;
      try {
        files = fs.readdirSync(lib);
      } catch (error) {
        continue;
      }
      for (const file of files) {
        if (!/\.(js|ts)$/.test(file)) continue;
        const source = fs.readFileSync(path.join(lib, file), 'utf8');
        for (const name of names) {
          if (new RegExp(`require\\(\\s*['"]${name}(?:/|['"])`).test(source)) {
            offenders.push(`${pkg}/lib/${file} requires ${name}`);
          }
        }
      }
    }
    assert.deepEqual(offenders, [], offenders.join('\n  '));
  });

  const describeApp = fs.existsSync(APP) ? describe : describe.skip;

  describeApp('in the built app', () => {
    it('none of them ship', () => {
      const shipped = names.filter(name =>
        fs.existsSync(path.join(APP, 'node_modules', name))
      );
      assert.deepEqual(
        shipped,
        [],
        'these are repository tooling, not part of the editor:\n  ' +
          shipped.join('\n  ')
      );
    });
  });
});

/**
 * season ships a `csonc` command-line tool the editor never invokes, and it is
 * the only thing in the package that requires yargs. Shipping it dragged in a
 * whole yargs 3.x tree nested beside the hoisted yargs 16 -- six of the
 * repository's nested version conflicts for a binary with no caller.
 *
 * The library half must keep shipping: season's main is lib/cson.js and a dozen
 * core files still read menus, keymaps and grammars through it until
 * docs/decisions/retiring-textmate-grammars.md removes it outright.
 */
describe('season ships its library, not its CLI', () => {
  const include = require('../lib/include-path-in-packaged-app');
  const ROOT_ = path.resolve(__dirname, '..', '..');
  const p = (...parts) => path.join(ROOT_, 'node_modules', 'season', ...parts);

  it('keeps the library and its manifest', () => {
    assert.ok(include(p('lib', 'cson.js')), 'season is still read by core');
    assert.ok(include(p('package.json')), 'the manifest resolves the package');
  });

  it('drops the CLI and the yargs tree it pulls', () => {
    assert.ok(!include(p('lib', 'csonc.js')), 'the CLI has no caller');
    assert.ok(!include(p('bin', 'csonc')), 'the bin has no caller');
    assert.ok(
      !include(p('node_modules', 'yargs', 'index.js')),
      'yargs 3.x is reachable only from csonc'
    );
  });

  it('nothing in the shipped tree reaches csonc', () => {
    // If something ever requires it, this must fail rather than ship broken --
    // the same standard the dev-tooling list is held to.
    const offenders = [];
    const scan = dir => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (error) {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === 'spec') continue;
          scan(full);
        } else if (/\.(js|ts)$/.test(entry.name)) {
          const source = fs.readFileSync(full, 'utf8');
          if (/require\(\s*['"]season\/lib\/csonc/.test(source)) {
            offenders.push(path.relative(ROOT_, full));
          }
        }
      }
    };
    scan(path.join(ROOT_, 'src'));
    scan(path.join(ROOT_, 'packages'));
    assert.deepEqual(offenders, [], offenders.join('\n  '));
  });

  const describeApp_ = fs.existsSync(APP) ? describe : describe.skip;
  describeApp_('in the built app', () => {
    it('the CLI and its yargs tree are absent', () => {
      const seasonDir = path.join(APP, 'node_modules', 'season');
      assert.ok(
        fs.existsSync(path.join(seasonDir, 'lib', 'cson.js')),
        'the season library must still ship'
      );
      for (const gone of [
        ['bin'],
        ['lib', 'csonc.js'],
        ['node_modules']
      ]) {
        assert.ok(
          !fs.existsSync(path.join(seasonDir, ...gone)),
          `season/${gone.join('/')} must not ship`
        );
      }
    });
  });
});
