'use strict';

/**
 * 8B first slice: github package is React 18 + createRoot.
 * Inbox stays. Run: node --test script/ci/github-8b.test.js
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
    // 0.37.x, not an exact pin: the package takes patch bumps (e.g. the PR 23
    // chevron-global conversion) and this guard is about the 8B shape —
    // React 18, no Relay — not about a frozen version number.
    assert.match(app.packageDependencies.github, /^0\.37\.\d+$/);
    // 1.1.0 catalog: npm pins, 0 git SHAs (see baseline-1.1.0.test.js).
    assert.match(
      app.dependencies.github,
      /^npm:@builtbygio\/github@0\.37\.\d+$/
    );
    const pkg = JSON.parse(read('package.json'));
    assert.match(pkg.version, /^0\.37\.\d+$/);
    assert.strictEqual(pkg.dependencies.react, '18.3.1');
    assert.strictEqual(pkg.dependencies['react-dom'], '18.3.1');
    assert.ok(!pkg.dependencies['react-relay']);
    assert.ok(!pkg.dependencies['relay-runtime']);
  });

  it('ships no Relay layer (Wave 2)', () => {
    // 8B replaced Relay with graphql-client + GraphQLQuery. 0.37.13 deleted
    // what was left: an unloadable network-layer manager (it required
    // relay-runtime, never a dependency), the relay-compiler artifacts, and
    // the 655 KB schema those artifacts were generated from.
    assert.ok(
      !fs.existsSync(
        path.join(GITHUB, 'lib', 'relay-network-layer-manager.js')
      ),
      'relay-network-layer-manager required relay-runtime, which is not a dep'
    );
    assert.ok(
      !fs.existsSync(path.join(GITHUB, 'graphql', 'schema.graphql')),
      'schema.graphql only fed relay-compiler'
    );

    const generated = [];
    const walk = dir => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === 'node_modules') continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === '__generated__') generated.push(full);
          else walk(full);
        }
      }
    };
    walk(path.join(GITHUB, 'lib'));
    assert.deepStrictEqual(generated, [], 'relay-compiler artifacts remain');

    const pkg = JSON.parse(read('package.json'));
    assert.ok(!pkg.dependencies.graphql, 'graphql@14 was required by nothing');
    assert.ok(!(pkg.devDependencies || {})['relay-compiler']);
    assert.ok(!(pkg.devDependencies || {})['babel-plugin-relay']);
  });

  it('keeps the live 8B GraphQL path', () => {
    // relay-stub stands in for Relay pagination props; load-recovered reads
    // graphql/recovered/ at runtime. Neither is dead weight.
    assert.ok(fs.existsSync(path.join(GITHUB, 'lib', 'relay-stub.js')));
    assert.ok(fs.existsSync(path.join(GITHUB, 'lib', 'graphql-client.js')));
    assert.ok(
      fs.existsSync(path.join(GITHUB, 'lib', 'views', 'graphql-query.js'))
    );
    const recovered = fs.readdirSync(path.join(GITHUB, 'graphql', 'recovered'));
    assert.ok(
      recovered.length > 0,
      'recovered GraphQL documents are loaded at runtime'
    );
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
    const detail = read('lib/containers/issueish-detail-container.js');
    const reviews = read('lib/containers/reviews-container.js');
    const decorations = read('lib/containers/comment-decorations-container.js');
    const createDialog = read('lib/containers/create-dialog-container.js');
    for (const src of [detail, reviews, decorations, createDialog]) {
      assert.match(src, /graphql-query/);
      assert.doesNotMatch(src, /QueryRenderer/);
    }
    assert.match(detail, /BareIssueishDetailController/);
    assert.match(reviews, /BareReviewsController/);
    assert.match(decorations, /BareCommentDecorationsController/);
    assert.match(createDialog, /BareCreateDialogController/);
    assert.ok(fs.existsSync(path.join(GITHUB, 'lib', 'relay-stub.js')));
    assert.ok(fs.existsSync(path.join(GITHUB, 'lib', 'graphql-pager.js')));
    assert.ok(
      fs.existsSync(
        path.join(GITHUB, 'lib', 'containers', 'aggregated-reviews-json.js')
      )
    );
    assert.ok(fs.existsSync(path.join(GITHUB, 'lib', 'graphql-client.js')));
    const client = read('lib/graphql-client.js');
    assert.match(client, /graphqlMutate/);
    const addReaction = read('lib/mutations/add-reaction.js');
    assert.match(addReaction, /graphqlMutate/);
    assert.doesNotMatch(addReaction, /commitMutation/);
    const libJs = [];
    function walk(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === '__generated__') continue;
          walk(p);
        } else if (ent.name.endsWith('.js')) libJs.push(p);
      }
    }
    walk(path.join(GITHUB, 'lib'));
    for (const p of libJs) {
      if (p.endsWith('relay-network-layer-manager.js')) continue;
      const src = fs.readFileSync(p, 'utf8');
      assert.doesNotMatch(src, /require\(['\"]react-relay['\"]\)/, p);
    }
    const recovered = path.join(GITHUB, 'graphql', 'recovered');
    const docs = fs.readdirSync(recovered).filter(n => n.endsWith('.graphql'));
    assert.ok(
      docs.length >= 30,
      `expected recovered operations, got ${docs.length}`
    );
  });

  it('login copy points at a classic PAT, not github.atom.io', () => {
    const src = read('lib/views/github-login-view.js');
    assert.doesNotMatch(src, /github\.atom\.io/);
    assert.match(src, /settings\/tokens/);
    assert.match(src, /classic/);
    assert.match(src, /user:email/);
    assert.match(src, /oauthClientId|Login with GitHub/);
    const auth = read('lib/github-app-auth.js');
    assert.match(auth, /device\/code/);
    assert.match(auth, /ghu_/);
    const dir = read('lib/views/directory-select.js');
    const timings = read('lib/views/git-timings-view.js');
    assert.doesNotMatch(dir, /electron\.remote|_electron\.remote/);
    assert.doesNotMatch(timings, /electron\.remote|_electron\.remote/);
  });
});
