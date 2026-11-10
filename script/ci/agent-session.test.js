'use strict';

/**
 * An agent tool call is denied unless something allows it, and a granted
 * read is remembered with the reason it was asked.
 *
 * docs/reference/agent-session.md
 * Run: node --test script/ci/agent-session.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  createSession,
  formatSession,
  MAX_ENTRIES
} = require('../../src/agent-session');

describe('agent session', () => {
  it('refuses a read that has no path or no reason', () => {
    const session = createSession();
    assert.throws(() => session.recordRead({ why: 'because' }), /path/);
    assert.throws(() => session.recordRead({ path: 'a.js' }), /reason/);
  });

  it('denies a tool call when nothing is asking the person', async () => {
    const session = createSession();
    const decision = await session.requestTool({
      kind: 'run',
      summary: 'Run the tests',
      detail: 'npm test'
    });
    assert.strictEqual(decision.allowed, false);
    assert.deepEqual(
      session.decisions().map(call => [call.kind, call.allowed, call.summary]),
      [['run', false, 'Run the tests']]
    );
    assert.deepEqual(session.reads(), []);
  });

  it('records a granted read with the reason, and skips a denied one', async () => {
    const session = createSession();
    await session.requestTool(
      { kind: 'read', summary: 'See how trust is stored', detail: 'src/lsp/index.js' },
      () => true
    );
    await session.requestTool(
      { kind: 'read', summary: 'Read the token file', detail: '.env' },
      () => false
    );
    assert.deepEqual(
      session.reads().map(read => [read.path, read.why]),
      [['src/lsp/index.js', 'See how trust is stored']]
    );
    const text = formatSession(session);
    assert.match(text, /`src\/lsp\/index\.js` — See how trust is stored/);
    assert.match(text, /Denied read: Read the token file/);
    assert.doesNotMatch(text, /\.env/);
  });

  it('keeps the latest reads and decisions when the log is full', () => {
    const session = createSession();
    for (let i = 0; i < MAX_ENTRIES + 1; i++) {
      session.recordRead({ path: `f${i}`, why: 'scan' });
    }
    const reads = session.reads();
    assert.strictEqual(reads.length, MAX_ENTRIES);
    assert.strictEqual(reads[0].path, 'f1');
    assert.strictEqual(reads[reads.length - 1].path, `f${MAX_ENTRIES}`);
  });

  it('is wired to the command and to chevron.agent', () => {
    const root = path.resolve(__dirname, '..', '..');
    const commands = fs.readFileSync(
      path.join(root, 'src/register-default-commands.ts'),
      'utf8'
    );
    const init = fs.readFileSync(
      path.join(root, 'src/initialize-application-window.js'),
      'utf8'
    );
    assert.match(commands, /'agent:show-context'/);
    assert.match(init, /chevron\.agent/);
    assert.match(init, /requestTool/);
  });
});
