'use strict';

/**
 * The user stylesheet compiles in a packaged build.
 *
 * theme-manager prepends
 *   @import "variables/ui-variables";
 *   @import "variables/syntax-variables";
 * to the user stylesheet and to any package stylesheet compiled at run time.
 * The build compiled static/variables/*.less to 0-byte .css -- definitions emit
 * no CSS -- and deleted the originals, so those imports resolved to nothing and
 * every user stylesheet failed on launch.
 *
 * Run: node --test script/ci/user-stylesheet-compiles.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'out', 'app');
const less = require(path.join(ROOT, 'node_modules', 'less'));

const FALLBACK_IMPORTS =
  '@import "variables/ui-variables";\n@import "variables/syntax-variables";\n';

describe('theme-manager still prepends the base variable imports', () => {
  it('so the definitions have to remain resolvable', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src', 'theme-manager.js'),
      'utf8'
    );
    assert.match(src, /@import "variables\/ui-variables"/);
    assert.match(src, /@import "variables\/syntax-variables"/);
  });

  it('reports something useful when Less gives no message', () => {
    // less-cache compiles with syncImport, and on that path Less reports a
    // Syntax error with message undefined. The notification used to read
    // "Line number: 0" followed by "undefined".
    const src = fs.readFileSync(
      path.join(ROOT, 'src', 'theme-manager.js'),
      'utf8'
    );
    assert.match(src, /function describeLessError/);
    assert.ok(
      !/\$\{error\.message\}/.test(src),
      'the detail must not interpolate error.message directly; it is often ' +
        'undefined on the syncImport path'
    );
  });
});

const describeApp = fs.existsSync(APP) ? describe : describe.skip;

describeApp('in the built app', () => {
  const variablesDir = path.join(APP, 'static', 'variables');

  it('ships the base variable definitions as Less', () => {
    for (const name of ['ui-variables.less', 'syntax-variables.less']) {
      assert.ok(
        fs.existsSync(path.join(variablesDir, name)),
        `static/variables/${name} must ship`
      );
    }
  });

  it('compiles a stock user stylesheet', async () => {
    const stock =
      '/* Your Stylesheet */\n.tree-view {\n}\natom-text-editor {\n}\n';
    const result = await less.render(FALLBACK_IMPORTS + stock, {
      filename: path.join(APP, 'styles.less'),
      paths: [variablesDir, path.join(APP, 'static')]
    });
    assert.ok(typeof result.css === 'string');
  });

  it('resolves theme variables a user stylesheet references', async () => {
    // The point of the fallback imports: @text-color has to mean something.
    const result = await less.render(
      FALLBACK_IMPORTS + '.tree-view { color: @text-color; }\n',
      {
        filename: path.join(APP, 'styles.less'),
        paths: [variablesDir, path.join(APP, 'static')]
      }
    );
    assert.match(
      result.css,
      /color:\s*#[0-9a-f]{3,6}/i,
      `@text-color must resolve to a colour, got: ${result.css.trim()}`
    );
  });
});
