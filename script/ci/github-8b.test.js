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
    assert.strictEqual(app.packageDependencies.github, '0.37.3');
    assert.match(app.dependencies.github, /b828392fceb570959faadee96a8304ea9b39a741/);
    const pkg = JSON.parse(read('package.json'));
    assert.strictEqual(pkg.version, '0.37.3');
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

  it('markdown tooltips use graphql-client, not QueryRenderer', () => {
    const issueish = read('lib/items/issueish-tooltip-item.js');
    const mention = read('lib/items/user-mention-tooltip-item.js');
    assert.match(issueish, /graphql-query/);
    assert.match(mention, /graphql-query/);
    assert.doesNotMatch(issueish, /QueryRenderer/);
    assert.doesNotMatch(mention, /QueryRenderer/);
    const header = read('lib/containers/github-tab-header-container.js');
    const remote = read('lib/containers/remote-container.js');
    assert.match(header, /graphql-query/);
    assert.match(remote, /graphql-query/);
    assert.doesNotMatch(header, /QueryRenderer/);
    assert.doesNotMatch(remote, /QueryRenderer/);
    const search = read('lib/containers/issueish-search-container.js');
    const current = read('lib/containers/current-pull-request-container.js');
    assert.match(search, /graphql-query/);
    assert.match(current, /graphql-query/);
    assert.doesNotMatch(search, /QueryRenderer/);
    assert.doesNotMatch(current, /QueryRenderer/);
    assert.match(search, /BareIssueishListController/);
    assert.match(current, /BareIssueishListController/);
    assert.ok(fs.existsSync(path.join(GITHUB, 'lib', 'graphql-client.js')));
    const recovered = path.join(GITHUB, 'graphql', 'recovered');
    const docs = fs
      .readdirSync(recovered)
      .filter(n => n.endsWith('.graphql'));
    assert.ok(docs.length >= 30, `expected recovered operations, got ${docs.length}`);
  });

  it('login copy points at a classic PAT, not github.atom.io', () => {
    const src = read('lib/views/github-login-view.js');
    assert.doesNotMatch(src, /github\.atom\.io/);
    assert.match(src, /settings\/tokens/);
    assert.match(src, /classic/);
    assert.match(src, /user:email/);
  });
});
