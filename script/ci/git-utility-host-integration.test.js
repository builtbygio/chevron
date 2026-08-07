'use strict';

/**
 * Integration: fork git-utility-host as a real child (IPC path) and run dugite.
 * Simulates utilityProcess messaging without Electron.
 *
 * Run: node --test script/ci/git-utility-host-integration.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');
const { fork } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = path.join(ROOT, 'src/main-process/workers/git-utility-host.js');

function forkHost() {
  return fork(HOST, [], {
    env: Object.assign({}, process.env, {
      CHEVRON_APP_PATH: ROOT
    }),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
}

function onceMessage(child, predicate, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout waiting for host message'));
    }, timeoutMs);
    function onMessage(msg) {
      if (predicate(msg)) {
        cleanup();
        resolve(msg);
      }
    }
    function onExit(code) {
      cleanup();
      reject(new Error(`host exited early with code ${code}`));
    }
    function cleanup() {
      clearTimeout(timer);
      child.removeListener('message', onMessage);
      child.removeListener('exit', onExit);
    }
    child.on('message', onMessage);
    child.on('exit', onExit);
  });
}

describe('git-utility-host integration (dugite)', () => {
  it('init → renderer-ready → git status via dugite', async () => {
    const child = forkHost();
    const stderr = [];
    if (child.stderr) {
      child.stderr.on('data', chunk => stderr.push(chunk.toString()));
    }

    try {
      await onceMessage(child, m => m && m.type === 'host-booted');

      child.send({
        type: 'init',
        managerWebContentsId: 1,
        operationCountLimit: 10,
        channelName: 'github:renderer-ipc',
        syntheticWebContentsId: -42
      });

      const ready = await onceMessage(
        child,
        m => m && m.type === 'renderer-ready'
      );
      assert.strictEqual(ready.sourceWebContentsId, -42);
      assert.ok(ready.data && ready.data.pid > 0);

      child.send({
        type: 'git-exec',
        data: {
          id: 1,
          args: ['status', '--porcelain'],
          workingDir: ROOT,
          options: {}
        }
      });

      const result = await onceMessage(
        child,
        m => m && m.type === 'git-data' && m.data && m.data.id === 1
      );
      assert.ok(result.data.results);
      assert.strictEqual(typeof result.data.results.stdout, 'string');
      assert.strictEqual(typeof result.data.results.exitCode, 'number');
      // repo is a git work tree; exit 0 expected
      assert.strictEqual(
        result.data.results.exitCode,
        0,
        `git status failed: ${result.data.results.stderr || ''} ${stderr.join('')}`
      );
      assert.ok(result.data.results.timing);
    } finally {
      child.kill();
    }
  });

  it('git --version returns dugite-bundled git', async () => {
    const child = forkHost();
    try {
      await onceMessage(child, m => m && m.type === 'host-booted');
      child.send({
        type: 'init',
        managerWebContentsId: 1,
        syntheticWebContentsId: -7,
        operationCountLimit: 5,
        channelName: 'github:renderer-ipc'
      });
      await onceMessage(child, m => m && m.type === 'renderer-ready');

      child.send({
        type: 'git-exec',
        data: {
          id: 99,
          args: ['--version'],
          workingDir: ROOT,
          options: {}
        }
      });
      const result = await onceMessage(
        child,
        m => m && m.type === 'git-data' && m.data && m.data.id === 99
      );
      assert.strictEqual(result.data.results.exitCode, 0);
      assert.match(result.data.results.stdout, /git version/i);
    } finally {
      child.kill();
    }
  });
});
