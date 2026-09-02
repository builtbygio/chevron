'use strict';

/**
 * Socket files do not accumulate in the temp directory.
 *
 * The socket name derives from a per-ATOM_HOME secret, so every run with a
 * throwaway home makes a new one, and a killed or crashed process cannot
 * remove its own. 268 had built up before this was noticed.
 *
 * Liveness has to be decided by connecting: only the owning process can
 * answer, and the file existing proves nothing.
 *
 * Run: node --test script/ci/socket-cleanup.test.js
 */

const { describe, it, after } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const { makeTempDir } = require('../lib/temp-dir');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const APPLICATION = path.join(
  ROOT, 'src', 'main-process', 'atom-application.js'
);

// Mirrors sweepStaleSockets in atom-application.js.
const sweep = async (dir, ownPath) => {
  const removed = [];
  await Promise.all(
    fs
      .readdirSync(dir)
      .filter(entry => /^atom-[0-9a-f]{12}\.sock$/.test(entry))
      .map(entry => path.join(dir, entry))
      .filter(candidate => candidate !== ownPath)
      .map(
        candidate =>
          new Promise(resolve => {
            const client = net.connect({ path: candidate });
            const done = alive => {
              client.destroy();
              if (!alive) {
                try {
                  fs.unlinkSync(candidate);
                  removed.push(path.basename(candidate));
                } catch (error) {
                  /* raced */
                }
              }
              resolve();
            };
            client.once('connect', () => done(true));
            client.once('error', () => done(false));
            client.setTimeout(250, () => done(true));
          })
      )
  );
  return removed.sort();
};

// makeTempDir, not mkdtempSync: it registers the directory for removal on
// exit and on a signal. script/ci/temp-dir-hygiene.test.js enforces this.
const scratch = makeTempDir('sock-test-');
const servers = [];
after(() => {
  for (const server of servers) server.close();
});

// A stale socket is one whose owner died: close() would remove the file, which
// is exactly the case that never happens in practice. So bind in a child and
// kill it, leaving the file behind with nothing listening.
function plantStale(name) {
  const p = path.join(scratch, name);
  const child = spawn(process.execPath, [
    '-e',
    `require('net').createServer().listen(${JSON.stringify(p)}, () => ` +
      `process.stdout.write('up'))`
  ]);
  return new Promise((resolve, reject) => {
    child.stdout.once('data', () => {
      child.kill('SIGKILL');
      child.once('exit', () => resolve(p));
    });
    child.once('error', reject);
  });
}

function plantLive(name) {
  const p = path.join(scratch, name);
  const server = net.createServer();
  servers.push(server);
  return new Promise(resolve => server.listen(p, () => resolve(p)));
}

describe('stale socket sweep', () => {
  it('removes sockets nothing is listening on', async () => {
    const a = await plantStale('atom-aaaaaaaaaaaa.sock');
    const b = await plantStale('atom-bbbbbbbbbbbb.sock');
    assert.ok(fs.existsSync(a) && fs.existsSync(b));

    const removed = await sweep(scratch, null);
    assert.deepEqual(removed, [
      'atom-aaaaaaaaaaaa.sock',
      'atom-bbbbbbbbbbbb.sock'
    ]);
    assert.ok(!fs.existsSync(a) && !fs.existsSync(b));
  });

  it('spares a socket a live instance is listening on', async () => {
    // The case that makes this dangerous: sweeping a running editor's socket
    // would break single-instance handoff for that editor.
    const live = await plantLive('atom-cccccccccccc.sock');
    const stale = await plantStale('atom-dddddddddddd.sock');

    const removed = await sweep(scratch, null);
    assert.deepEqual(removed, ['atom-dddddddddddd.sock']);
    assert.ok(fs.existsSync(live), 'a live socket must survive the sweep');
  });

  it('never touches its own path', async () => {
    const own = await plantStale('atom-eeeeeeeeeeee.sock');
    const removed = await sweep(scratch, own);
    assert.deepEqual(removed, []);
    assert.ok(fs.existsSync(own));
    fs.unlinkSync(own);
  });

  it('ignores unrelated files', async () => {
    const other = path.join(scratch, 'not-a-socket.txt');
    fs.writeFileSync(other, 'x');
    const shortName = path.join(scratch, 'atom-abc.sock');
    fs.writeFileSync(shortName, 'x');
    await sweep(scratch, null);
    assert.ok(fs.existsSync(other), 'unrelated files are not touched');
    assert.ok(fs.existsSync(shortName), 'the name pattern is specific');
    fs.unlinkSync(other);
    fs.unlinkSync(shortName);
  });
});

describe('atom-application still wires the cleanup', () => {
  const src = fs.readFileSync(APPLICATION, 'utf8');

  it('sweeps on startup', () => {
    assert.ok(/const sweepStaleSockets = async/.test(src));
    assert.ok(
      /await sweepStaleSockets\(this\.socketPath\)/.test(src),
      'the sweep must run when the server is set up'
    );
  });

  it('decides liveness by connecting, not by existsSync', () => {
    const fn = src.slice(src.indexOf('const sweepStaleSockets'));
    const body = fn.slice(0, fn.indexOf('\nconst getExistingSocketSecret'));
    assert.ok(
      /net\.connect/.test(body),
      'only the owning process can say whether a socket is live'
    );
  });

  it('unlinks synchronously on will-quit', () => {
    // Electron does not await a promise returned from will-quit, so an async
    // unlink loses the race with process exit.
    const i = src.indexOf("'will-quit'");
    const handler = src.slice(i, i + 500);
    assert.ok(/deleteSocketFileSync\(\)/.test(handler));
    assert.ok(/deleteSocketSecretFileSync\(\)/.test(handler));
    assert.ok(
      !/return Promise\.all/.test(handler),
      'the handler must not rely on a returned promise'
    );
  });
});
