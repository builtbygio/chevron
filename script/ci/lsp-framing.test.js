'use strict';

/**
 * Phase 0 LSP Content-Length framing tests.
 * Run: node --test script/ci/lsp-framing.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const {
  encodeMessage,
  LspFrameDecoder,
  parseBody
} = require('../../src/lsp/framing');

describe('LSP framing encodeMessage', () => {
  it('prefixes Content-Length and body', () => {
    const msg = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
    const buf = encodeMessage(msg);
    const s = buf.toString('utf8');
    assert.ok(s.startsWith('Content-Length: '));
    assert.ok(s.includes('\r\n\r\n'));
    const body = s.split('\r\n\r\n')[1];
    assert.deepStrictEqual(JSON.parse(body), msg);
    const len = Number(s.match(/^Content-Length:\s*(\d+)/)[1]);
    assert.strictEqual(len, Buffer.byteLength(body, 'utf8'));
  });
});

describe('LSP framing LspFrameDecoder', () => {
  it('decodes a single complete frame', () => {
    const dec = new LspFrameDecoder();
    const msg = { jsonrpc: '2.0', id: 1, result: { ok: true } };
    const frames = dec.push(encodeMessage(msg));
    assert.strictEqual(frames.length, 1);
    assert.deepStrictEqual(parseBody(frames[0]), msg);
    assert.strictEqual(dec.pendingBytes, 0);
  });

  it('handles split headers across chunks', () => {
    const dec = new LspFrameDecoder();
    const msg = { a: 1 };
    const full = encodeMessage(msg);
    const mid = 10;
    assert.strictEqual(dec.push(full.slice(0, mid)).length, 0);
    const frames = dec.push(full.slice(mid));
    assert.strictEqual(frames.length, 1);
    assert.deepStrictEqual(parseBody(frames[0]), msg);
  });

  it('handles split body across chunks', () => {
    const dec = new LspFrameDecoder();
    const msg = { hello: 'world', n: 42 };
    const full = encodeMessage(msg);
    const sep = full.indexOf('\r\n\r\n') + 4;
    assert.strictEqual(dec.push(full.slice(0, sep + 3)).length, 0);
    const frames = dec.push(full.slice(sep + 3));
    assert.strictEqual(frames.length, 1);
    assert.deepStrictEqual(parseBody(frames[0]), msg);
  });

  it('handles coalesced messages in one chunk', () => {
    const dec = new LspFrameDecoder();
    const m1 = { id: 1 };
    const m2 = { id: 2 };
    const frames = dec.push(
      Buffer.concat([encodeMessage(m1), encodeMessage(m2)])
    );
    assert.strictEqual(frames.length, 2);
    assert.deepStrictEqual(parseBody(frames[0]), m1);
    assert.deepStrictEqual(parseBody(frames[1]), m2);
  });

  it('handles multibyte UTF-8 in body (emoji)', () => {
    const dec = new LspFrameDecoder();
    const msg = { text: 'hello 👋 world' };
    const frames = dec.push(encodeMessage(msg));
    assert.strictEqual(frames.length, 1);
    assert.deepStrictEqual(parseBody(frames[0]), msg);
    // Content-Length is byte length, not string length
    const encoded = encodeMessage(msg).toString('utf8');
    const len = Number(encoded.match(/Content-Length:\s*(\d+)/)[1]);
    assert.ok(len > msg.text.length);
  });

  it('rejects missing Content-Length', () => {
    const dec = new LspFrameDecoder();
    assert.throws(
      () => dec.push(Buffer.from('Content-Type: application/vscode-jsonrpc\r\n\r\n{}')),
      /Content-Length/
    );
  });

  it('rejects oversized header without separator', () => {
    const dec = new LspFrameDecoder({ maxHeaderBytes: 32 });
    assert.throws(
      () => dec.push(Buffer.alloc(40, 'x')),
      /header exceeds/
    );
  });

  it('byte-by-byte streaming still yields one message', () => {
    const dec = new LspFrameDecoder();
    const full = encodeMessage({ n: 7 });
    let got = [];
    for (let i = 0; i < full.length; i++) {
      got = got.concat(dec.push(full.slice(i, i + 1)));
    }
    assert.strictEqual(got.length, 1);
    assert.deepStrictEqual(parseBody(got[0]), { n: 7 });
  });
});
