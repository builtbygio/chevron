'use strict';

/**
 * Integration: fork git-utility-host as a real child (IPC path) and run dugite.
 * Simulates utilityProcess messaging without Electron.
 *
 * Requires dugite in node_modules (full bootstrap, or CI step that installs it).
 * Run: node --test script/ci/git-utility-host-integration.test.js
 */

const { describe, it, before } = require('node:test');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = path.join(ROOT, 'src/main-process/workers/git-utility-host.js');

function resolveDugite() {
  try {
    return require.resolve('dugite', {
      paths: [
        path.join(ROOT, 'node_modules'),
        path.join(ROOT, 'node_modules', 'github', 'node_modules')
      ]
    });
  } catch (error) {
    return null;
  }
}

const DUGITE_PATH = resolveDugite();

// Resolving the module is not enough. CI installs dugite with
// --ignore-scripts and then fetches the embedded git separately, because that
// download is a GitHub release tarball and flaky (ECONNRESET). When all its
// retries fail the workflow prints
//
//   WARNING: dugite embedded git missing after retries; git-utility tests may
//   skip or use PATH git.
//
// and carries on -- but this file only skipped on `!DUGITE_PATH`, so with the
// module present and the binary absent it ran anyway and failed the merge
// gate on a third-party download. Check for the binary the tests actually
// invoke, honouring LOCAL_GIT_DIRECTORY the way dugite does.
function resolveEmbeddedGit() {
  if (!DUGITE_PATH) return null;
  const root = process.env.LOCAL_GIT_DIRECTORY
    ? path.resolve(process.env.LOCAL_GIT_DIRECTORY)
    : path.join(path.dirname(DUGITE_PATH), '..', '..', 'git');
  const candidates =
    process.platform === 'win32'
      ? [path.join(root, 'cmd', 'git.exe'), path.join(root, 'bin', 'git.exe')]
      : [path.join(root, 'bin', 'git')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const EMBEDDED_GIT = resolveEmbeddedGit();
const SKIP_REASON = !DUGITE_PATH
  ? 'dugite is not installed'
  : !EMBEDDED_GIT
    ? 'dugite embedded git is missing (its download failed); ' +
      'these tests exercise the bundled binary, not PATH git'
    : null;
if (SKIP_REASON) {
  console.log(`git-utility-host integration: skipped -- ${SKIP_REASON}`);
}

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
    const stderr = [];
    if (child.stderr) {
      child.stderr.on('data', chunk => stderr.push(String(chunk)));
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `timeout waiting for host message\nstderr: ${stderr.join('')}`
        )
      );
    }, timeoutMs);
    function onMessage(msg) {
      if (msg && msg.type === 'host-error') {
        cleanup();
        reject(
          new Error(
            `host-error: ${msg.data && msg.data.message}\n${(msg.data &&
              msg.data.stack) ||
              ''}\nstderr: ${stderr.join('')}`
          )
        );
        return;
      }
      if (predicate(msg)) {
        cleanup();
        resolve(msg);
      }
    }
    function onExit(code) {
      cleanup();
      reject(
        new Error(
          `host exited early with code ${code}\nstderr: ${stderr.join('')}`
        )
      );
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

describe('git-utility-host integration (dugite)', { skip: SKIP_REASON || false }, () => {
  before(() => {
    assert.ok(DUGITE_PATH, 'dugite must be resolvable for integration tests');
  });

  it('init → renderer-ready → git status via dugite', async () => {
    const child = forkHost();

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
        `git status failed: ${result.data.results.stderr || ''}`
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
