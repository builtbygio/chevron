'use strict';

/**
 * 8B first slice: github package is React 18 + createRoot.
 * Inbox / Relay 5 stay. Run: node --test script/ci/github-8b.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const GITHUB = path.join(ROOT, 'node_modules', 'github');

function read(rel) {
  return fs.readFileSync(path.join(GITHUB, rel), 'utf8');
}

describe('github 8B React 18 (inbox stays)', () => {
  it('pins github 0.37 and React 18.3', () => {
    const app = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    );
    assert.strictEqual(app.packageDependencies.github, '0.37.0');
    assert.match(app.dependencies.github, /ebc07441ecf09799cd28d6f753e4311889ba1a51/);
    const pkg = JSON.parse(read('package.json'));
    assert.strictEqual(pkg.version, '0.37.0');
    assert.strictEqual(pkg.dependencies.react, '18.3.1');
    assert.strictEqual(pkg.dependencies['react-dom'], '18.3.1');
    assert.strictEqual(pkg.dependencies['react-relay'], '5.0.0');
    assert.strictEqual(pkg.dependencies.graphql, '14.5.8');
  });

  it('mounts with createRoot, not ReactDOM.render', () => {
    assert.ok(fs.existsSync(path.join(GITHUB, 'lib', 'react-root.js')));
    const helper = read('lib/react-root.js');
    assert.match(helper, /createRoot/);
    assert.match(helper, /react-dom\/client/);
    const main = read('lib/github-package.js');
    assert.match(main, /react-root/);
    assert.doesNotMatch(main, /unmountComponentAtNode/);
    assert.doesNotMatch(main, /ReactDOM\.render|_reactDom\.default\.render/);
  });

  it('login copy points at a classic PAT, not github.atom.io', () => {
    const src = read('lib/views/github-login-view.js');
    assert.doesNotMatch(src, /github\.atom\.io/);
    assert.match(src, /settings\/tokens/);
    assert.match(src, /classic/);
    assert.match(src, /user:email/);
  });
});
