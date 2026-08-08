'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const {
  normalizeDiagnostic,
  createDiagnosticsService
} = require('../../src/lsp/diagnostics-service');

class FakeEmitter {
  constructor() {
    this._h = new Map();
  }
  on(name, cb) {
    if (!this._h.has(name)) this._h.set(name, []);
    this._h.get(name).push(cb);
    return {
      dispose: () => {
        const arr = this._h.get(name) || [];
        const i = arr.indexOf(cb);
        if (i >= 0) arr.splice(i, 1);
      }
    };
  }
  emit(name, payload) {
    for (const cb of this._h.get(name) || []) cb(payload);
  }
}

describe('diagnostics service', () => {
  it('normalizes LSP diagnostic', () => {
    const n = normalizeDiagnostic(
      {
        severity: 1,
        message: 'oops',
        source: 'ts',
        code: 2322,
        range: {
          start: { line: 2, character: 4 },
          end: { line: 2, character: 8 }
        }
      },
      'file:///a.ts'
    );
    assert.strictEqual(n.uri, 'file:///a.ts');
    assert.strictEqual(n.severity, 1);
    assert.strictEqual(n.range.start.row, 2);
    assert.strictEqual(n.range.start.column, 4);
    assert.strictEqual(n.message, 'oops');
  });

  it('subscribes and aggregates counts', () => {
    const map = new Map();
    const emitter = new FakeEmitter();
    const svc = createDiagnosticsService(map, emitter);

    let seen = null;
    const sub = svc.onDidUpdateDiagnostics(ev => {
      seen = ev;
    });

    map.set('file:///a.ts', [
      {
        severity: 1,
        message: 'e',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 }
        }
      }
    ]);
    emitter.emit('did-publish-diagnostics', {
      uri: 'file:///a.ts',
      diagnostics: map.get('file:///a.ts')
    });

    assert.ok(seen);
    assert.strictEqual(seen.diagnostics.length, 1);
    assert.strictEqual(svc.getTotalCount(), 1);
    assert.strictEqual(svc.getDiagnostics('file:///a.ts').length, 1);
    sub.dispose();
  });
});
