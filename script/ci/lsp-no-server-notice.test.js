'use strict';

/**
 * The "no language server" notice says something the user can act on.
 *
 * It named three packages to install -- chevron-lsp-typescript, -rust,
 * -python. But resolveRegistration() consults package registrations, then user
 * config, then the built-in table, and returns null only when none of them
 * covers the scope. TypeScript, Python and Rust are built in, so the notice
 * never fires for them: the packages it recommended could not help whatever
 * scope actually triggered it.
 *
 * Run: node --test script/ci/lsp-no-server-notice.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX = path.join(ROOT, 'src', 'lsp', 'index.js');
const UI = path.join(ROOT, 'packages', 'lsp-ui', 'lib', 'main.js');
const BUILTINS = path.join(ROOT, 'src', 'lsp', 'builtin-servers.js');

describe('no-server notice', () => {
  const src = fs.readFileSync(INDEX, 'utf8');

  it('does not name packages that cannot apply', () => {
    for (const name of [
      'chevron-lsp-typescript',
      'chevron-lsp-rust',
      'chevron-lsp-python'
    ]) {
      assert.ok(
        !src.includes(`${name}, `) && !src.includes(`${name} with cpm`),
        `the notice must not recommend ${name}: its scopes are built in, so ` +
          'the notice never fires for them'
      );
    }
  });

  it('points at the install flow instead', () => {
    assert.match(src, /Use "Install packages"/);
    assert.match(src, /Chevron Lsp: Trust Project/);
  });

  it('the scopes it recommended are indeed built in', () => {
    // If a scope ever leaves the built-in table, the notice could fire for it
    // and naming a package would become correct again.
    const builtins = fs.readFileSync(BUILTINS, 'utf8');
    for (const scope of ['source.ts', 'source.python', 'source.rust']) {
      assert.ok(
        builtins.includes(`'${scope}'`),
        `${scope} is expected in the built-in table`
      );
    }
  });
});

describe('the notice offers a way to act', () => {
  const ui = fs.readFileSync(UI, 'utf8');

  it('carries an Install packages button', () => {
    const start = ui.indexOf('const showNoServer');
    assert.ok(start > -1, 'showNoServer must still exist');
    const body = ui.slice(start, start + 900);
    assert.match(body, /buttons:\s*\[/);
    assert.match(body, /text: 'Install packages'/);
    assert.match(body, /settings-view:install-packages-and-themes/);
  });
});
