'use strict';

/**
 * G5 supervision: restart storm policy constants + mock exit/restart flow.
 * Run: node --test script/ci/lsp-supervision.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { fork } = require('child_process');
const {
  RESTART_MAX,
  RESTART_WINDOW_MS,
  DEFAULT_IDLE_MS
} = require('../../src/main-process/workers/lsp-host');
const { encodeMessage } = require('../../src/lsp/framing');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = path.join(ROOT, 'src/main-process/workers/lsp-host.js');

describe('supervision policy constants', () => {
  it('exports restart budget and idle default', () => {
    assert.strictEqual(RESTART_MAX, 3);
    assert.strictEqual(RESTART_WINDOW_MS, 5 * 60 * 1000);
    assert.strictEqual(DEFAULT_IDLE_MS, 10 * 60 * 1000);
  });
});

function writeCrashingServer(dir) {
  const script = path.join(dir, 'crash-once-server.js');
  // First initialize ok; on didOpen exit — forces host restart path.
  // Use env CRASH_COUNT file to exit only first run.
  fs.writeFileSync(
    script,
    `
const {encodeMessage,LspFrameDecoder,parseBody}=require(${JSON.stringify(
      path.join(ROOT, 'src/lsp/framing.js')
    )});
const fs=require('fs');
const marker=process.env.CRASH_MARKER;
const dec=new LspFrameDecoder();
let crashed=false;
try { crashed = fs.existsSync(marker); } catch(_){}
process.stdin.on('data',chunk=>{
  for (const body of dec.push(chunk)) {
    const msg=parseBody(body);
    if (msg.method==='initialize') {
      process.stdout.write(encodeMessage({jsonrpc:'2.0',id:msg.id,result:{capabilities:{textDocumentSync:1},positionEncoding:'utf-16'}}));
    } else if (msg.method==='initialized') {
      if (!crashed) {
        try { fs.writeFileSync(marker,'1'); } catch(_){}
        process.exit(2);
      }
    } else if (msg.method==='shutdown') {
      process.stdout.write(encodeMessage({jsonrpc:'2.0',id:msg.id,result:null}));
    } else if (msg.id!=null) {
      process.stdout.write(encodeMessage({jsonrpc:'2.0',id:msg.id,result:null}));
    }
  }
});
`,
    'utf8'
  );
  return script;
}

function waitFor(child, predicate, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    const onMsg = msg => {
      try {
        if (predicate(msg)) {
          clearTimeout(t);
          child.removeListener('message', onMsg);
          resolve(msg);
        }
      } catch (e) {
        clearTimeout(t);
        reject(e);
      }
    };
    child.on('message', onMsg);
  });
}

describe('host restarts crashing server once', () => {
  let tmp;
  let host;
  let marker;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-sup-'));
    marker = path.join(tmp, 'crashed');
  });

  after(() => {
    if (host && !host.killed) host.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('emits server-restarting then server-initialized with restarted', async () => {
    const script = writeCrashingServer(tmp);
    host = fork(HOST, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: Object.assign({}, process.env, { CRASH_MARKER: marker })
    });
    await waitFor(host, m => m && m.type === 'host-booted');

    host.send({
      type: 'start-server',
      serverId: 'crashy',
      command: process.execPath,
      args: [script],
      rootUri: 'file:///tmp/proj',
      cwd: tmp,
      idleTimeoutMs: 0 // disable idle during test
    });

    await waitFor(host, m => m && m.type === 'server-initialized' && !m.restarted);

    const restarting = waitFor(
      host,
      m => m && m.type === 'server-restarting' && m.serverId === 'crashy'
    );
    const reInit = waitFor(
      host,
      m => m && m.type === 'server-initialized' && m.restarted === true
    );

    // Trigger crash via initialized path already done; first init caused exit
    const r1 = await restarting;
    assert.ok(r1.delayMs >= 1000);
    const r2 = await reInit;
    assert.strictEqual(r2.serverId, 'crashy');
    assert.ok(r2.restarts >= 1);

    host.send({ type: 'stop-server', serverId: 'crashy' });
    await waitFor(host, m => m && m.type === 'server-stopped');
    host.kill();
    host = null;
  });
});
