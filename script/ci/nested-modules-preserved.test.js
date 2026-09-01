'use strict';

/**
 * Packaging keeps the dependency versions pnpm resolved.
 *
 * pnpm nests a dependency under the package that needs it whenever the hoisted
 * copy does not satisfy that package's range. copy-assets walked the top-level
 * entries only, so those nested copies were dropped and every package fell
 * back to the single hoisted version.
 *
 * That failed silently and only in the packaged app, because the dev tree
 * resolves correctly. markdown-preview was the case that surfaced: htmlparser2
 * needs entities ^7, the app shipped 4.5.0, and opening a preview said
 * "Previewing Markdown Failed" while the same code worked in dev.
 *
 * It was being patched one casualty at a time -- tree-view/minimatch,
 * language-css/tree-sitter-css, htmlparser2/entities, parse5/entities. The
 * audit found 126 dependencies whose hoisted replacement did not satisfy the
 * declared range, 36 of them in packages the editor actually loads, so naming
 * them individually was never going to finish.
 *
 * This asserts the general property instead: for every shipped package, a
 * dependency it declares resolves to a version inside its range.
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
