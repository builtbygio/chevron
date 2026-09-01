'use strict';

/**
 * Lint, test and build tooling is not shipped to users.
 *
 * The root package.json has 152 dependencies and no devDependencies, so
 * nothing in the manifest separates the editor's dependencies from the
 * repository's. copy-assets copies every top-level node_modules entry, so
 * `standard`'s eslint stack, `inquirer`'s rxjs, the test harnesses and
 * prebuildify all went into the asar -- 17.1 MB of it.
 *
 * The list in include-path-in-packaged-app.js is named rather than derived,
 * deliberately. Deriving it would mean trusting the declared dependency graph,
 * and packages require things they do not declare: every bundled package with
 * "no runtime dependencies" requires event-kit. Each name was checked against
 * a require trace of a running editor -- 659 modules across 143 packages --
 * and appears in none of them.
 *
 * This test does the cheap half of that continuously: nothing in the shipped
 * tree may require one of these by name. It will not catch a module loaded
 * through a computed name, which is why the list is conservative and holds
 * only packages whose role is unambiguous.
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
