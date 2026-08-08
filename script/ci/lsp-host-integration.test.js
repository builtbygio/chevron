'use strict';

/**
 * Phase 1 LSP host integration (fork host as child_process, no Electron).
 * Run: node --test script/ci/lsp-host-integration.test.js
 *
 * Spawns workers/lsp-host.js via child_process.fork and a mock server script.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { fork } = require('child_process');
const { encodeMessage } = require('../../src/lsp/framing');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = path.join(ROOT, 'src/main-process/workers/lsp-host.js');

function writeMockServer(dir) {
  const script = path.join(dir, 'mock-lsp-server.js');
  // Minimal server: respond to initialize, echo hover, accept shutdown
  fs.writeFileSync(
    script,
    `
const {encodeMessage,LspFrameDecoder,parseBody}=require(${JSON.stringify(
      path.join(ROOT, 'src/lsp/framing.js')
    )});
const dec=new LspFrameDecoder();
process.stdin.on('data',chunk=>{
  for (const body of dec.push(chunk)) {
    const msg=parseBody(body);
    if (msg.method==='initialize') {
      process.stdout.write(encodeMessage({jsonrpc:'2.0',id:msg.id,result:{
        capabilities:{
          hoverProvider:true,definitionProvider:true,referencesProvider:true,
          signatureHelpProvider:{triggerCharacters:['(',',']},
          completionProvider:{resolveProvider:true},textDocumentSync:1
        },
        // Simulate a utf-8 server (rust-analyzer-like) for encoding negotiation
        positionEncoding:'utf-8'
      }}));
    } else if (msg.method==='shutdown') {
      process.stdout.write(encodeMessage({jsonrpc:'2.0',id:msg.id,result:null}));
    } else if (msg.method==='textDocument/hover') {
      process.stdout.write(encodeMessage({jsonrpc:'2.0',id:msg.id,result:{contents:{kind:'plaintext',value:'mock-hover'}}}));
    } else if (msg.method==='textDocument/definition') {
      process.stdout.write(encodeMessage({jsonrpc:'2.0',id:msg.id,result:{
        uri:'file:///tmp/proj/a.ts',
        range:{start:{line:1,character:0},end:{line:1,character:3}}
      }}));
    } else if (msg.method==='textDocument/completion') {
      process.stdout.write(encodeMessage({jsonrpc:'2.0',id:msg.id,result:{
        isIncomplete:false,
        items:[{label:'alpha',kind:6},{label:'beta',kind:3,insertText:'beta($0)',insertTextFormat:2}]
      }}));
    } else if (msg.method==='initialized' || msg.method==='exit' || msg.method==='textDocument/didOpen') {
      // ok
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

function waitFor(child, predicate, timeoutMs = 8000) {
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

describe('LSP host integration (mock server)', () => {
  let tmp;
  let mockScript;
  let host;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-host-int-'));
    mockScript = writeMockServer(tmp);
  });

  after(() => {
    if (host && !host.killed) host.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('starts mock server, initializes, and answers hover', async () => {
    host = fork(HOST, [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    await waitFor(host, m => m && m.type === 'host-booted');

    host.send({
      type: 'start-server',
      serverId: 'mock',
      command: process.execPath,
      args: [mockScript],
      rootUri: 'file:///tmp/proj',
      cwd: tmp
    });

    const initMsg = await waitFor(host, m => m && m.type === 'server-initialized');
    assert.strictEqual(initMsg.positionEncoding, 'utf-8');

    const requestId = 42;
    const responseP = waitFor(
      host,
      m => m && m.type === 'response' && m.requestId === requestId
    );
    host.send({
      type: 'request',
      serverId: 'mock',
      requestId,
      method: 'textDocument/hover',
      params: {
        textDocument: { uri: 'file:///tmp/proj/a.ts' },
        position: { line: 0, character: 0 }
      }
    });
    const resp = await responseP;
    assert.ok(resp.result);
    assert.strictEqual(resp.result.contents.value, 'mock-hover');

    const defId = 43;
    const defP = waitFor(
      host,
      m => m && m.type === 'response' && m.requestId === defId
    );
    host.send({
      type: 'request',
      serverId: 'mock',
      requestId: defId,
      method: 'textDocument/definition',
      params: {
        textDocument: { uri: 'file:///tmp/proj/a.ts' },
        position: { line: 0, character: 0 }
      }
    });
    const defResp = await defP;
    assert.ok(defResp.result);
    assert.strictEqual(defResp.result.uri, 'file:///tmp/proj/a.ts');
    assert.strictEqual(defResp.result.range.start.line, 1);

    const compId = 44;
    const compP = waitFor(
      host,
      m => m && m.type === 'response' && m.requestId === compId
    );
    host.send({
      type: 'request',
      serverId: 'mock',
      requestId: compId,
      method: 'textDocument/completion',
      params: {
        textDocument: { uri: 'file:///tmp/proj/a.ts' },
        position: { line: 0, character: 1 }
      }
    });
    const compResp = await compP;
    assert.ok(compResp.result);
    assert.strictEqual(compResp.result.items.length, 2);
    assert.strictEqual(compResp.result.items[0].label, 'alpha');

    host.send({ type: 'stop-server', serverId: 'mock' });
    await waitFor(host, m => m && m.type === 'server-stopped');
    host.kill();
    host = null;
  });
});
