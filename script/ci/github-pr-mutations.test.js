'use strict';

/**
 * merge-pull-request / create-pull-request send well-formed GraphQL.
 *
 * These are the two mutations Atom never had: "Create Pull Request" pushed the
 * branch and opened a compare URL in a browser, and merging was not offered at
 * all. Both now go through graphqlMutate like the other eleven mutations.
 *
 * The guards matter more than the happy path. Merging without expectedHeadOid
 * merges whatever the head is when the request lands, so a push arriving
 * between render and click would be merged unreviewed -- with the oid, GitHub
 * rejects it instead. That is asserted here rather than left to review.
 *
 * Run: node --test script/ci/github-pr-mutations.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const LIB = path.join(ROOT, 'packages', 'github', 'lib');
const RECOVERED = path.join(ROOT, 'packages', 'github', 'graphql', 'recovered');

// Capture what graphqlMutate would send, without a network.
function withCapturedMutate(run) {
  const clientPath = require.resolve(path.join(LIB, 'graphql-client.js'));
  const original = require.cache[clientPath];
  const sent = [];
  require.cache[clientPath] = new Module(clientPath, null);
  require.cache[clientPath].filename = clientPath;
  require.cache[clientPath].loaded = true;
  require.cache[clientPath].exports = {
    graphqlMutate: (auth, documentName, variables) => {
      sent.push({ auth, documentName, variables });
      return Promise.resolve({ data: {} });
    },
    graphqlRequest: () => Promise.resolve({}),
    resolveAuth: a => a
  };
  for (const m of ['merge-pull-request.js', 'create-pull-request.js']) {
    delete require.cache[require.resolve(path.join(LIB, 'mutations', m))];
  }
  try {
    return run(sent);
  } finally {
    if (original) require.cache[clientPath] = original;
    else delete require.cache[clientPath];
    for (const m of ['merge-pull-request.js', 'create-pull-request.js']) {
      delete require.cache[require.resolve(path.join(LIB, 'mutations', m))];
    }
  }
}

const AUTH = { url: 'https://api.github.com/graphql', token: 'x' };

describe('github pull request mutations', () => {
  it('the documents exist and name themselves consistently', () => {
    for (const name of [
      'mergePullRequestMutation',
      'createPullRequestMutation'
    ]) {
      const file = path.join(RECOVERED, `${name}.graphql`);
      assert.ok(fs.existsSync(file), `${name}.graphql is missing`);
      const src = fs.readFileSync(file, 'utf8');
      assert.ok(
        new RegExp(`mutation\\s+${name}\\b`).test(src),
        `${name}.graphql must declare "mutation ${name}" -- loadRecovered ` +
          'resolves documents by filename, so a mismatch is silent'
      );
      assert.ok(
        /\$input:\s*\w+Input!/.test(src),
        `${name}.graphql must take a non-null $input`
      );
    }
  });

  it('merge sends the expected head oid and merge method', async () => {
    await withCapturedMutate(async sent => {
      const merge = require(path.join(LIB, 'mutations', 'merge-pull-request.js'));
      await merge(AUTH, {
        pullRequestID: 'PR_1',
        headOid: 'abc123',
        mergeMethod: 'SQUASH',
        commitHeadline: 'Squash it'
      });
      assert.equal(sent.length, 1);
      assert.equal(sent[0].documentName, 'mergePullRequestMutation');
      assert.deepEqual(sent[0].variables.input, {
        pullRequestId: 'PR_1',
        expectedHeadOid: 'abc123',
        mergeMethod: 'SQUASH',
        commitHeadline: 'Squash it'
      });
    });
  });

  it('merge refuses without a head oid', async () => {
    await withCapturedMutate(async sent => {
      const merge = require(path.join(LIB, 'mutations', 'merge-pull-request.js'));
      await assert.rejects(
        () => merge(AUTH, { pullRequestID: 'PR_1' }),
        /headOid/,
        'merging without expectedHeadOid would merge a concurrent push'
      );
      assert.equal(sent.length, 0, 'nothing may be sent when the guard trips');
    });
  });

  it('merge refuses an unknown merge method', async () => {
    await withCapturedMutate(async sent => {
      const merge = require(path.join(LIB, 'mutations', 'merge-pull-request.js'));
      await assert.rejects(
        () => merge(AUTH, { pullRequestID: 'PR_1', headOid: 'a', mergeMethod: 'FASTFORWARD' }),
        /unknown mergeMethod/
      );
      assert.equal(sent.length, 0);
    });
  });

  it('create sends the repository, refs and title', async () => {
    await withCapturedMutate(async sent => {
      const create = require(path.join(LIB, 'mutations', 'create-pull-request.js'));
      await create(AUTH, {
        repositoryID: 'R_1',
        baseRefName: 'master',
        headRefName: 'topic',
        title: 'Add a thing',
        body: 'why'
      });
      assert.equal(sent[0].documentName, 'createPullRequestMutation');
      assert.deepEqual(sent[0].variables.input, {
        repositoryId: 'R_1',
        baseRefName: 'master',
        headRefName: 'topic',
        title: 'Add a thing',
        draft: false,
        maintainerCanModify: true,
        body: 'why'
      });
    });
  });

  it('create refuses when a required field is missing', async () => {
    await withCapturedMutate(async sent => {
      const create = require(path.join(LIB, 'mutations', 'create-pull-request.js'));
      for (const missing of ['repositoryID', 'baseRefName', 'headRefName', 'title']) {
        const args = {
          repositoryID: 'R_1',
          baseRefName: 'master',
          headRefName: 'topic',
          title: 'T'
        };
        delete args[missing];
        await assert.rejects(() => create(AUTH, args), new RegExp(missing));
      }
      assert.equal(sent.length, 0);
    });
  });
});
