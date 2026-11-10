'use strict';

/**
 * Clicking inline blame opens a commit detail item. A failed or missing
 * commit used to leave that item on the octocat spinner. These checks cover
 * the cache key, the workdir round-trip, the patch parser, and the view
 * leaving the spinner.
 *
 * Run: node --test script/ci/commit-detail-open.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { makeTempDir } = require('../lib/temp-dir');

const electronStub = {
  ipcRenderer: {
    send() {},
    sendSync() {
      return 1;
    },
    invoke() {
      return Promise.resolve(null);
    },
    on() {
      return this;
    }
  }
};

const chevronStub = {
  config: {
    get() {
      return false;
    }
  },
  inSpecMode() {
    return true;
  },
  openUtilityWorkerWindow() {
    return null;
  },
  TextBuffer: class TextBuffer {},
  tooltips: { add() { return { dispose() {} }; } },
  notifications: { addError() {} },
  packages: {
    resolvePackagePath(name) {
      if (name === 'github') return path.join(path.resolve(__dirname, '..', '..'), 'packages', 'github');
      return null;
    }
  }
};

global.chevron = chevronStub;
global.atom = chevronStub;

function nativeSuperstring() {
  class TextBuffer {}
  class Patch {}
  class TextWriter {}
  class TextReader {}
  return { TextBuffer, TextWriter, TextReader, Patch };
}

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'electron') return electronStub;
  if (id === 'chevron') return chevronStub;
  if (typeof id === 'string' && id.includes('superstring') && id.endsWith('.node')) return nativeSuperstring();
  return origRequire.apply(this, arguments);
};

const ROOT = path.resolve(__dirname, '..', '..');
const GITHUB = path.join(ROOT, 'packages', 'github', 'lib');
const { Keys } = require(path.join(GITHUB, 'models', 'repository-states', 'cache', 'keys.js'));
const URIPattern = require(path.join(GITHUB, 'chevron', 'uri-pattern.js')).default;
const { default: CommitDetailItem } = require(path.join(GITHUB, 'items', 'commit-detail-item.js'));
const { default: CommitDetailContainer } = require(path.join(GITHUB, 'containers', 'commit-detail-container.js'));
const { default: GitShellOutStrategy } = require(path.join(GITHUB, 'git-shell-out-strategy.js'));
const { Operation } = require(path.join(GITHUB, 'worker-manager.js'));

const SHA = 'a'.repeat(40);

function container() {
  return new CommitDetailContainer({
    repository: {
      isLoading() {
        return false;
      },
      acceptInvalidation() {}
    },
    sha: SHA,
    itemType: function ItemType() {}
  });
}

describe('commit detail open', () => {
  it('caches a commit separately from the blob with the same sha', () => {
    assert.notEqual(Keys.commit.oneWith(SHA).getPrimary(), Keys.blob.oneWith(SHA).getPrimary());
    assert.equal(Keys.commit.oneWith(SHA).getPrimary(), `commit:${SHA}`);
  });

  it('keeps a "+" in the working directory through the commit URI', () => {
    const workdir = '/tmp/a+b';
    const uri = CommitDetailItem.buildURI(workdir, SHA);
    const match = new URIPattern(CommitDetailItem.uriPattern).matches(uri);
    assert.equal(match.ok(), true);
    assert.equal(match.getParams().workingDirectory, workdir);
    assert.equal(match.getParams().sha, SHA);

    const selected = new URIPattern(CommitDetailItem.buildURI(workdir, '{sha}')).matches(uri);
    assert.equal(selected.ok(), true);
    assert.equal(selected.getParams().sha, SHA);

    const plain = '/home/keeper/Workspace/chevron';
    const plainUri = CommitDetailItem.buildURI(plain, SHA);
    const plainMatch = new URIPattern(CommitDetailItem.uriPattern).matches(plainUri);
    assert.equal(plainMatch.getParams().workingDirectory, plain);
  });

  it('uses a resident repository when the exact workdir key is absent', () => {
    const real = { isPresent: () => true, name: 'real' };
    const item = new CommitDetailItem({
      workdirContextPool: {
        getContext() {
          return { getRepository: () => ({ isPresent: () => false, name: 'absent' }) };
        },
        withResidentContexts(callback) {
          callback('/repo/chevron', {
            getRepository: () => real,
            getWorkingDirectory: () => '/repo/chevron'
          });
        }
      },
      workingDirectory: '/repo/chevron',
      sha: SHA
    });

    assert.equal(item.repositoryFor('/repo/chevron/packages/github'), real);
    assert.equal(item.repositoryFor('/somewhere/else').name, 'absent');
  });

  it('shows an error instead of the spinner when the commit is missing or the fetch fails', async () => {
    const view = container();
    const missing = view.renderResult({ commit: { isPresent: () => false } });
    assert.equal(missing.props.title, 'Commit not found');

    const failed = view.renderResult({ __error: 'git exploded' });
    assert.equal(failed.props.title, 'Unable to open this commit');
    assert.deepEqual(failed.props.descriptions, ['git exploded']);

    const loadingRepo = {
      isLoading() {
        return true;
      }
    };
    const loading = new CommitDetailContainer({
      repository: loadingRepo,
      sha: SHA,
      itemType: function ItemType() {}
    });
    assert.equal(loading.renderResult(null).type.name, 'LoadingView');

    const data = await view.fetchData({
      getCommit: async () => {
        throw new Error('git exploded\nstdout: huge');
      },
      getCurrentBranch: async () => ({ getName: () => 'master' }),
      getRemoteForBranch: async () => ({}),
      isCommitPushed: async () => false
    });
    assert.equal(data.__error, 'git exploded');
  });

  it('parses one commit and keeps going when the patch text is junk', async () => {
    const strategy = Object.create(GitShellOutStrategy.prototype);
    const diff = [
      'diff --git a/a b/a',
      'new file mode 100644',
      'index 0000000..1111111',
      '--- /dev/null',
      '+++ b/a',
      '@@ -0,0 +1 @@',
      '+hi'
    ].join('\n');
    const record = ['b'.repeat(40), 'gio@example.com', 'Gio', '1700000000', 'Subject', 'Body', diff].join('\0');
    let args = null;
    strategy.exec = async next => {
      args = next;
      return `${record}\0`;
    };

    const commits = await strategy.getCommits({ max: 1, ref: SHA, includePatch: true });
    assert.equal(args[args.indexOf('-n') + 1], '1');
    assert.equal(commits.length, 1);
    assert.equal(commits[0].sha, 'b'.repeat(40));
    assert.equal(commits[0].messageSubject, 'Subject');
    assert.ok(Array.isArray(commits[0].patch));
    assert.equal(commits[0].patch.length, 1);

    strategy.exec = async () => ['c'.repeat(40), 'gio@example.com', 'Gio', '1700000000', 'Subject', 'Body', 'this is not a diff'].join('\0');
    const broken = await strategy.getCommits({ max: 1, ref: SHA, includePatch: true });
    assert.equal(broken.length, 1);
    assert.deepEqual(broken[0].patch, []);

    strategy.exec = async () => 'only-a-sha';
    const truncated = await strategy.getCommits({ max: 1, ref: SHA, includePatch: true });
    assert.deepEqual(truncated, []);
  });

  it('parses the git log of one small commit', async () => {
    // The checkout's HEAD on a pull request is a merge commit. A shallow
    // clone then makes `git log --patch` emit the whole tree, and the
    // command buffer overflows. A one-file repository stays small.
    const dir = makeTempDir('commit-detail-');
    execFileSync('git', ['init', '-b', 'master'], { cwd: dir });
    fs.writeFileSync(path.join(dir, 'a.txt'), 'hello\n');
    execFileSync('git', ['add', 'a.txt'], { cwd: dir });
    execFileSync('git', [
      '-c', 'user.email=gio@example.com',
      '-c', 'user.name=Gio',
      '-c', 'commit.gpgsign=false',
      'commit', '-m', 'Add a'
    ], { cwd: dir });
    const output = execFileSync('git', [
      'log',
      '--pretty=format:%H%x00%ae%x00%an%x00%at%x00%s%x00%b%x00',
      '--no-abbrev-commit',
      '--no-prefix',
      '--no-ext-diff',
      '--no-renames',
      '-z',
      '-n',
      '1',
      'HEAD',
      '--patch',
      '-m',
      '--first-parent',
      '--'
    ], { cwd: dir, encoding: 'utf8' });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    const strategy = Object.create(GitShellOutStrategy.prototype);
    strategy.exec = async () => output;
    const commits = await strategy.getCommits({ max: 1, ref: 'HEAD', includePatch: true });
    assert.equal(commits.length, 1);
    assert.equal(commits[0].sha, head);
    assert.equal(commits[0].messageSubject, 'Add a');
    assert.ok(commits[0].patch.length > 0);
  });

  it('rejects a git result whose handler throws instead of leaving the operation pending', async () => {
    const err = await new Promise((resolve, reject) => {
      const operation = new Operation({}, () => reject(new Error('resolved')), resolve);
      operation.complete({}, () => {
        throw new Error('missing timing');
      });
    });
    assert.equal(err.message, 'missing timing');
  });
});
