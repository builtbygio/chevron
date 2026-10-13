'use strict';

/**
 * Inline git blame (#424): the porcelain parser against real `git blame`
 * output, the annotation text, the cache keys that keep it fresh, and the
 * controller that decides which line gets annotated and when.
 *
 * Run: node --test script/ci/inline-blame.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Emitter } = require('event-kit');
const { makeTempDir } = require('../lib/temp-dir');

const ROOT = path.resolve(__dirname, '..', '..');
const GITHUB = path.join(ROOT, 'packages', 'github', 'lib');
const {
  parseBlamePorcelain,
  formatInlineBlame,
  UNCOMMITTED_SHA
} = require(path.join(GITHUB, 'models', 'blame.js'));
const { Keys } = require(path.join(GITHUB, 'models', 'repository-states', 'cache', 'keys.js'));
const {
  default: InlineBlameController,
  REQUEST_DEBOUNCE_MS,
  MAX_BLAME_LINES
} = require(path.join(GITHUB, 'controllers', 'inline-blame-controller.js'));

function git(cwd, args, input) {
  return execFileSync('git', args, {
    cwd,
    input,
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      GIT_AUTHOR_NAME: 'Gio',
      GIT_AUTHOR_EMAIL: 'gio@example.com',
      GIT_COMMITTER_NAME: 'Gio',
      GIT_COMMITTER_EMAIL: 'gio@example.com',
      GIT_AUTHOR_DATE: '1700000000 +0000',
      GIT_COMMITTER_DATE: '1700000000 +0000'
    })
  });
}

function repository() {
  const dir = makeTempDir('inline-blame-');
  git(dir, ['init', '-q']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\n');
  git(dir, ['add', 'a.txt']);
  git(dir, ['commit', '-q', '-m', 'First lines']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\nthree\n');
  git(dir, ['commit', '-q', '-am', 'Add three']);
  return dir;
}

describe('parseBlamePorcelain', () => {
  it('maps each row to the commit that last changed it', () => {
    const dir = repository();
    const { lines } = parseBlamePorcelain(git(dir, ['blame', '--porcelain', '--', 'a.txt']));
    assert.strictEqual(lines.length, 3);
    assert.strictEqual(lines[0].summary, 'First lines');
    assert.strictEqual(lines[1], lines[0], 'one commit object per commit');
    assert.strictEqual(lines[2].summary, 'Add three');
    assert.strictEqual(lines[2].author, 'Gio');
    assert.strictEqual(lines[2].authorMail, 'gio@example.com');
    assert.strictEqual(lines[2].authorTime, 1700000000);
    assert.strictEqual(lines[2].uncommitted, false);
  });

  it('marks lines in no commit, from the file or from given contents', () => {
    const dir = repository();
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\nchanged\nthree\n');
    const onDisk = parseBlamePorcelain(git(dir, ['blame', '--porcelain', '--', 'a.txt']));
    assert.strictEqual(onDisk.lines[1].uncommitted, true);
    assert.strictEqual(onDisk.lines[1].sha, UNCOMMITTED_SHA);

    const unsaved = parseBlamePorcelain(
      git(dir, ['blame', '--porcelain', '--contents', '-', '--', 'a.txt'], 'zero\none\nchanged\nthree\n')
    );
    assert.strictEqual(unsaved.lines.length, 4);
    assert.strictEqual(unsaved.lines[0].uncommitted, true);
    assert.strictEqual(unsaved.lines[1].summary, 'First lines');
  });

  it('keeps a tab in the line text from being read as a header', () => {
    const sha = 'a'.repeat(40);
    const output = [
      `${sha} 1 1 1`,
      'author Gio',
      'summary s',
      'filename a.txt',
      `\t${sha} 9 9 9`,
      ''
    ].join('\n');
    assert.strictEqual(parseBlamePorcelain(output).lines.length, 1);
  });
});

describe('formatInlineBlame', () => {
  it('reads author, age and summary', () => {
    const now = 1700000000 * 1000;
    const commit = { author: 'Gio', authorTime: 1700000000 - 2 * 3600, summary: 'Fix soft wrap at EOL' };
    assert.strictEqual(formatInlineBlame(commit, now), 'Gio, 2 hours ago · Fix soft wrap at EOL');
  });

  it('says so for a line in no commit', () => {
    assert.strictEqual(formatInlineBlame({ uncommitted: true }), 'Not committed yet');
  });
});

describe('blame cache keys', () => {
  it('are dropped by anything that moves HEAD', () => {
    assert.ok(Keys.headOperationKeys().includes(Keys.blame.all));
  });

  it('are kept per file and grouped for that', () => {
    const key = Keys.blame.oneWith('lib/a.js');
    assert.strictEqual(key.getPrimary(), 'blame:lib/a.js');
    assert.deepStrictEqual(key.getGroups(), ['blame']);
  });
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const settle = () => wait(REQUEST_DEBOUNCE_MS + 50);

function commitFor(summary) {
  return { sha: 'b'.repeat(40), author: 'Gio', authorMail: 'g@x', authorTime: 1700000000, summary, uncommitted: false };
}

function harness({ lineCount = 3, filePath = '/repo/a.txt', blame, largeFile = false, loading = false } = {}) {
  const editorEmitter = new Emitter();
  const bufferEmitter = new Emitter();
  const decorations = [];
  const blameCalls = [];
  let cursorRow = 0;
  let modified = false;

  const editor = {
    getElement: () => element,
    getPath: () => filePath,
    getBuffer: () => ({
      getLineCount: () => lineCount,
      lineLengthForRow: () => 5,
      onDidChange: cb => bufferEmitter.on('change', cb)
    }),
    getCursorBufferPosition: () => ({ row: cursorRow }),
    isModified: () => modified,
    getText: () => 'unsaved text',
    markBufferPosition([row, column]) {
      const marker = {
        row,
        column,
        destroyed: false,
        getHeadBufferPosition: () => ({ row }),
        destroy() {
          this.destroyed = true;
        }
      };
      return marker;
    },
    decorateMarker(marker, params) {
      decorations.push({ marker, params });
    },
    onDidChangeCursorPosition: cb => editorEmitter.on('cursor', cb),
    onDidStopChanging: cb => editorEmitter.on('stop', cb),
    onDidSave: cb => editorEmitter.on('save', cb),
    onDidChangePath: cb => editorEmitter.on('path', cb),
    onDidDestroy: cb => editorEmitter.on('destroy', cb)
  };
  if (largeFile) editor.isLargeFileMode = () => true;
  const element = new EventTarget();

  const poolEmitter = new Emitter();
  let present = !loading;
  const repo = {
    isPresent: () => present,
    getBlame: async (relativePath, options) => {
      blameCalls.push({ relativePath, options });
      return blame || { lines: [commitFor('First'), commitFor('Second'), commitFor('Third')] };
    }
  };
  const context = { getRepository: () => repo, getWorkingDirectory: () => '/repo' };
  const configEmitter = new Emitter();
  const settings = { 'github.inlineBlame': true };
  const config = {
    get: key => settings[key],
    set(key, value) {
      settings[key] = value;
      configEmitter.emit(key, value);
    },
    observe(key, cb) {
      cb(settings[key]);
      return configEmitter.on(key, cb);
    }
  };
  const commandsAdded = {};
  const controller = new InlineBlameController({
    workspace: {
      observeActiveTextEditor(cb) {
        cb(editor);
        return { dispose() {} };
      }
    },
    config,
    commands: {
      add(target, commands) {
        Object.assign(commandsAdded, commands);
        return { dispose() {} };
      }
    },
    tooltips: { add: () => ({ dispose() {} }) },
    contextPool: {
      withResidentContexts: cb => [cb('/repo', context)],
      onDidUpdateRepository: () => ({ dispose() {} }),
      onDidChangeRepositoryState: cb => poolEmitter.on('state', cb),
      onDidChangePoolContexts: () => ({ dispose() {} })
    },
    now: () => 1700000000 * 1000
  });

  return {
    controller,
    decorations,
    blameCalls,
    config,
    commandsAdded,
    element,
    live: () => decorations.filter(d => !d.marker.destroyed),
    moveCursor(row) {
      cursorRow = row;
      editorEmitter.emit('cursor');
    },
    type() {
      modified = true;
      bufferEmitter.emit('change');
    },
    stopTyping: () => editorEmitter.emit('stop'),
    finishLoading() {
      present = true;
      poolEmitter.emit('state', context);
    }
  };
}

describe('InlineBlameController', () => {
  it("annotates the cursor's line, at its end, after the debounce", async () => {
    const h = harness();
    h.moveCursor(1);
    assert.strictEqual(h.live().length, 0, 'nothing before the debounce');
    await settle();
    const live = h.live();
    assert.strictEqual(live.length, 1);
    assert.strictEqual(live[0].params.type, 'inline-text');
    assert.strictEqual(live[0].params.class, 'github-InlineBlame');
    assert.strictEqual(live[0].params.text, 'Gio, a few seconds ago · Second');
    assert.deepStrictEqual([live[0].marker.row, live[0].marker.column], [1, 5]);
    h.controller.destroy();
  });

  it('moves with the cursor and never shows two', async () => {
    const h = harness();
    await settle();
    h.moveCursor(2);
    assert.strictEqual(h.live().length, 0, 'the old row is cleared at once');
    await settle();
    assert.strictEqual(h.live().length, 1);
    assert.strictEqual(h.live()[0].params.text.endsWith('Third'), true);
    h.controller.destroy();
  });

  it('asks the repository with a path relative to the workdir', async () => {
    const h = harness({ filePath: '/repo/lib/a.txt' });
    await settle();
    assert.deepStrictEqual(h.blameCalls, [{ relativePath: path.join('lib', 'a.txt'), options: undefined }]);
    h.controller.destroy();
  });

  it('blames an unsaved buffer by its contents, after typing stops', async () => {
    const h = harness();
    await settle();
    h.type();
    assert.strictEqual(h.live().length, 0, 'typing clears it');
    h.moveCursor(1);
    await settle();
    assert.strictEqual(h.live().length, 0, 'nothing while typing');
    h.stopTyping();
    await settle();
    assert.strictEqual(h.live().length, 1);
    assert.deepStrictEqual(h.blameCalls[h.blameCalls.length - 1].options, { contents: 'unsaved text' });
    h.controller.destroy();
  });

  it('shows "Not committed yet" for a line in no commit', async () => {
    const h = harness({ blame: { lines: [{ uncommitted: true, sha: UNCOMMITTED_SHA }] } });
    await settle();
    assert.strictEqual(h.live()[0].params.text, 'Not committed yet');
    h.controller.destroy();
  });

  it('blames once a repository that was loading becomes present', async () => {
    const h = harness({ loading: true });
    await settle();
    assert.strictEqual(h.live().length, 0);
    h.finishLoading();
    await settle();
    assert.strictEqual(h.live().length, 1);
    h.controller.destroy();
  });

  it('shows nothing for a file outside every repository', async () => {
    const h = harness({ filePath: '/elsewhere/a.txt' });
    await settle();
    assert.strictEqual(h.decorations.length, 0);
    assert.strictEqual(h.blameCalls.length, 0);
    h.controller.destroy();
  });

  it('skips files over the line limit and files in large-file mode', async () => {
    const big = harness({ lineCount: MAX_BLAME_LINES + 1 });
    const large = harness({ largeFile: true });
    await settle();
    assert.strictEqual(big.blameCalls.length + large.blameCalls.length, 0);
    big.controller.destroy();
    large.controller.destroy();
  });

  it('turns off with github.inlineBlame and the toggle command', async () => {
    const h = harness();
    await settle();
    assert.strictEqual(h.live().length, 1);
    h.commandsAdded['github:toggle-inline-blame']();
    assert.strictEqual(h.config.get('github.inlineBlame'), false);
    assert.strictEqual(h.live().length, 0);
    h.moveCursor(2);
    await settle();
    assert.strictEqual(h.live().length, 0);
    h.config.set('github.inlineBlame', true);
    await settle();
    assert.strictEqual(h.live().length, 1);
    h.controller.destroy();
  });

  it('drops an answer that arrives after the cursor moved on', async () => {
    let release;
    const h = harness();
    h.controller.contextPool.withResidentContexts = cb => [
      cb('/repo', {
        getWorkingDirectory: () => '/repo',
        getRepository: () => ({
          isPresent: () => true,
          getBlame: () => new Promise(resolve => {
            release = () => resolve({ lines: [commitFor('Stale'), commitFor('Stale'), commitFor('Stale')] });
          })
        })
      })
    ];
    h.moveCursor(1);
    await settle();
    const first = release;
    h.moveCursor(2);
    await settle();
    first();
    await wait(10);
    assert.strictEqual(h.live().length, 0, 'the first answer is stale');
    release();
    await wait(10);
    assert.strictEqual(h.live().length, 1);
    h.controller.destroy();
  });
});
