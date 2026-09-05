'use strict';

/**
 * The pty host, driven the way main drives it, with a real shell on the end.
 *
 * The validators in pty-ipc.test.js decide what may be asked for; this decides
 * whether asking works. They are different failures: #309 was a host that
 * booted, answered every check, and read nothing — the sort of thing only a
 * round trip catches.
 *
 * Forked with node:child_process rather than utilityProcess, which is why the
 * host speaks both transports.
 *
 * docs/process/next-tracks-plan.md, track 3.
 * Run: node --test script/ci/pty-host-integration.test.js
 */

const { describe, it, after } = require('node:test');
const assert = require('assert');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = path.join(ROOT, 'src', 'main-process', 'workers', 'pty-host.js');
const WINDOWS = process.platform === 'win32';
const SHELL = WINDOWS
  ? process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe'
  : process.env.SHELL || '/bin/bash';

let host = null;

function start() {
  host = fork(HOST, [], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    env: Object.assign({}, process.env, { CHEVRON_APP_PATH: ROOT })
  });
  return host;
}

function waitFor(child, predicate, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('timed out waiting for a host message')),
      timeoutMs
    );
    const onMessage = message => {
      let matched = false;
      try {
        matched = predicate(message);
      } catch (error) {
        clearTimeout(timer);
        child.removeListener('message', onMessage);
        return reject(error);
      }
      if (!matched) return;
      clearTimeout(timer);
      child.removeListener('message', onMessage);
      resolve(message);
    };
    child.on('message', onMessage);
  });
}

after(() => {
  if (host && !host.killed) host.kill();
});

describe('pty host', () => {
  it('boots, runs a command, and reports the exit', async () => {
    const child = start();
    await waitFor(child, m => m && m.type === 'host-booted');

    const id = 'session-1';
    const spawned = waitFor(child, m => m && m.type === 'spawned' && m.id === id);
    child.send({
      type: 'spawn',
      id,
      shell: SHELL,
      args: WINDOWS ? ['/c', 'echo hello-from-host'] : ['-lc', 'echo hello-from-host'],
      cwd: os.tmpdir(),
      cols: 80,
      rows: 24
    });

    const started = await spawned;
    assert.ok(started.pid > 0, 'the shell has a pid');

    let output = '';
    const sawOutput = waitFor(
      child,
      m => {
        if (m && m.type === 'data' && m.id === id) output += m.data;
        return output.includes('hello-from-host');
      },
      20000
    );
    await sawOutput;

    const exited = await waitFor(child, m => m && m.type === 'exit' && m.id === id);
    assert.strictEqual(exited.exitCode, 0);

    child.kill();
    host = null;
  });

  it('reports a shell it cannot start instead of going quiet', async () => {
    const child = start();
    await waitFor(child, m => m && m.type === 'host-booted');

    const id = 'session-missing';
    child.send({
      type: 'spawn',
      id,
      shell: path.join(path.sep, 'definitely', 'not', 'a', 'shell'),
      args: [],
      cwd: os.tmpdir(),
      cols: 80,
      rows: 24
    });

    // Either an error message or an immediate exit is an answer. Silence is
    // the failure: main would wait forever and the pane would stay black.
    const answer = await waitFor(
      child,
      m => m && (m.type === 'error' || m.type === 'exit') && m.id === id
    );
    assert.ok(answer, 'the host said something');

    child.kill();
    host = null;
  });

  it('takes a resize without dropping the session', async () => {
    const child = start();
    await waitFor(child, m => m && m.type === 'host-booted');

    const id = 'session-resize';
    child.send({
      type: 'spawn',
      id,
      shell: SHELL,
      args: WINDOWS ? [] : ['-i'],
      cwd: os.tmpdir(),
      cols: 80,
      rows: 24
    });
    await waitFor(child, m => m && m.type === 'spawned' && m.id === id);

    child.send({ type: 'resize', id, cols: 120, rows: 40 });

    // Ask the shell what size it thinks it is. On Windows this is not a
    // question cmd.exe answers, so only the round trip itself is checked.
    if (!WINDOWS) {
      let output = '';
      const sawSize = waitFor(
        child,
        m => {
          if (m && m.type === 'data' && m.id === id) output += m.data;
          return /40 120/.test(output);
        },
        20000
      );
      child.send({ type: 'write', id, data: 'stty size\n' });
      await sawSize;
    }

    child.send({ type: 'kill', id });
    await waitFor(child, m => m && m.type === 'exit' && m.id === id);

    child.kill();
    host = null;
  });
});
