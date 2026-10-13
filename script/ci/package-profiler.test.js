'use strict';

/**
 * The package profiler measures, attributes, and costs nothing when off.
 *
 * `timecop` reports what boot cost. This reports what a package costs after
 * activation, which is the part a user feels. Two properties matter enough to
 * gate:
 *
 *   1. **Off is free.** Every dispatch pays one boolean check and nothing
 *      else — no timing, no allocation, no stack. A profiler that slows the
 *      editor down to tell you what slows the editor down is worthless.
 *   2. **Attribution is not per call.** Registration captures structured
 *      frames (`Error.captureStackTrace`); the string is formatted lazily,
 *      once, on the first profiled call. Formatting eagerly at registration
 *      costs ~3x more and would land on the startup path.
 *
 * docs/process/next-tracks-plan.md, track 1.
 * Run: node --test script/ci/package-profiler.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const typescript = require(path.join(ROOT, 'src', 'typescript'));

// src/*.ts is transpiled at runtime by compile-cache; this test runs outside
// the app, so it does the same thing by hand.
function loadTs(relative) {
  const file = path.join(ROOT, relative);
  const compiled = typescript.compile(fs.readFileSync(file, 'utf8'), file);
  const module = { exports: {} };
  const localRequire = id =>
    id.startsWith('.')
      ? loadTs(path.join('src', `${id.replace(/^\.\//, '')}.ts`))
      : require(id);
  new Function('module', 'exports', 'require', compiled)(
    module,
    module.exports,
    localRequire
  );
  return module.exports;
}

const { PackageProfiler } = loadTs('src/package-profiler.ts');
const { formatProfilerReport } = loadTs('src/package-profiler-report.ts');

const SEP = path.sep;
const p = (...parts) => parts.join(SEP);

describe('attribution', () => {
  const profiler = new PackageProfiler();
  profiler.setPackageDirPaths([p('', 'repo', 'packages')]);

  it('names the package a call site belongs to', () => {
    assert.strictEqual(
      profiler.ownerForPath(p('', 'repo', 'packages', 'tree-view', 'lib', 'main.js')),
      'tree-view'
    );
  });

  it('handles a bundled package under node_modules', () => {
    assert.strictEqual(
      profiler.ownerForPath(p('', 'app', 'node_modules', 'bracket-matcher', 'index.js')),
      'bracket-matcher'
    );
  });

  it('keeps the scope on a scoped package', () => {
    assert.strictEqual(
      profiler.ownerForPath(p('', 'app', 'node_modules', '@builtbygio', 'github', 'lib', 'x.js')),
      '@builtbygio/github'
    );
  });

  it('calls Chevron itself core', () => {
    assert.strictEqual(
      profiler.ownerForPath(p('', 'repo', 'src', 'workspace.js')),
      'core'
    );
  });

  it('admits when it does not know', () => {
    assert.strictEqual(profiler.ownerForPath(p('', 'tmp', 'random.js')), null);
  });

  it('resolves a captured site to its owner, once', () => {
    const site = { stack: `Error\n    at Object.<anonymous> (${p('', 'repo', 'packages', 'tree-view', 'lib', 'main.js')}:12:9)` };
    assert.strictEqual(profiler.ownerForSite(site), 'tree-view');
    assert.strictEqual(site.owner, 'tree-view', 'the answer is cached on the site');
    site.stack = 'Error\n    at nowhere (/tmp/other.js:1:1)';
    assert.strictEqual(profiler.ownerForSite(site), 'tree-view', 'and not recomputed');
  });
});

describe('attribution through core', () => {
  const frame = file => `    at fn (${file}:1:1)`;
  const stack = (...files) => ['Error', ...files.map(frame)].join('\n');
  const editor = p('', 'repo', 'src', 'text-editor.js');
  const config = p('', 'repo', 'src', 'config.js');
  const treeView = p('', 'repo', 'packages', 'tree-view', 'lib', 'main.js');
  const eventKit = p('', 'repo', 'node_modules', 'event-kit', 'lib', 'emitter.js');
  const linter = p('', 'app', 'node_modules', 'linter', 'lib', 'main.js');

  function profilerWith(lookup) {
    const profiler = new PackageProfiler();
    profiler.setPackageDirPaths([p('', 'repo', 'packages')]);
    if (lookup) profiler.setPackageLookup(lookup);
    return profiler;
  }

  it('bills a subscription made through a core method to the package', () => {
    // TextEditor#onDidChange, Config#observe: the first frame is core, and
    // stopping there billed every package's handlers to Chevron.
    const profiler = profilerWith();
    assert.strictEqual(profiler.attribute(stack(editor, config, treeView)), 'tree-view');
  });

  it('is core when no package is on the stack', () => {
    const profiler = profilerWith(() => false);
    assert.strictEqual(profiler.attribute(stack(editor, config)), 'core');
  });

  it('does not mistake a library for a package', () => {
    const profiler = profilerWith(name => name === 'linter');
    assert.strictEqual(profiler.attribute(stack(editor, eventKit)), 'core');
    assert.strictEqual(profiler.attribute(stack(editor, eventKit, linter)), 'linter');
  });

  it('trusts a package directory over the lookup', () => {
    const profiler = profilerWith(() => false);
    assert.strictEqual(profiler.attribute(stack(editor, treeView)), 'tree-view');
  });

  it('is unknown when no frame says anything', () => {
    const profiler = profilerWith();
    assert.strictEqual(profiler.attribute('Error\n    at <anonymous>'), 'unknown');
  });

  it('a real subscription through a core-shaped file lands on the package', () => {
    // Real stacks, not strings: a src/ module that wraps on behalf of its
    // caller, called from a module under a package directory.
    const { makeTempDir } = require('../lib/temp-dir');
    const dir = makeTempDir('profiler-');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.mkdirSync(path.join(dir, 'packages', 'demo'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'emitter.js'),
      'module.exports = (profiler, cb) => profiler.wrap("event", cb);'
    );
    fs.writeFileSync(
      path.join(dir, 'packages', 'demo', 'main.js'),
      'module.exports = (profiler, on) => on(profiler, () => {});'
    );
    const profiler = new PackageProfiler();
    profiler.setPackageDirPaths([path.join(dir, 'packages')]);
    profiler.start();
    const on = require(path.join(dir, 'src', 'emitter.js'));
    const handler = require(path.join(dir, 'packages', 'demo', 'main.js'))(profiler, on);
    handler();
    assert.deepEqual(profiler.report().map(entry => entry.owner), ['demo']);
  });

  it('ownerOfCaller falls back to the open window, then core', () => {
    const profiler = profilerWith(() => false);
    profiler.attribute = () => 'core';
    assert.strictEqual(profiler.ownerOfCaller(), 'core');
    const previous = profiler.enter('autocomplete-plus');
    assert.strictEqual(profiler.ownerOfCaller(), 'autocomplete-plus');
    profiler.leave(previous);
    profiler.attribute = () => 'symbols-view';
    assert.strictEqual(profiler.ownerOfCaller(), 'symbols-view', 'the stack wins');
  });
});

describe('start, stop and reset', () => {
  it('reset clears the numbers and keeps a running profiler running', () => {
    const profiler = new PackageProfiler();
    profiler.start();
    profiler.record('command', 'x', 1);
    profiler.reset();
    assert.deepEqual(profiler.report(), []);
    assert.strictEqual(profiler.isRunning(), true);
    profiler.record('command', 'x', 1);
    assert.strictEqual(profiler.report().length, 1);
  });

  it('tells listeners about start, stop and reset, and lets them go', () => {
    const profiler = new PackageProfiler();
    let calls = 0;
    const subscription = profiler.onDidChangeState(() => calls++);
    profiler.start();
    profiler.reset();
    profiler.stop();
    assert.strictEqual(calls, 3);
    subscription.dispose();
    profiler.start();
    assert.strictEqual(calls, 3);
  });

  it('a throwing listener does not stop the others', () => {
    const profiler = new PackageProfiler();
    let reached = false;
    const original = console.error;
    console.error = () => {};
    try {
      profiler.onDidChangeState(() => {
        throw new Error('boom');
      });
      profiler.onDidChangeState(() => {
        reached = true;
      });
      profiler.start();
    } finally {
      console.error = original;
    }
    assert.strictEqual(reached, true);
  });
});

describe('save hooks', () => {
  function fakeBuffer() {
    class FakeBuffer {
      constructor() {
        this.will = [];
        this.did = [];
      }
      onWillSave(callback) {
        this.will.push(callback);
        return { dispose() {} };
      }
      onDidSave(callback) {
        this.did.push(callback);
        return { dispose() {} };
      }
    }
    return FakeBuffer;
  }

  it('times will-save and did-save handlers as save', async () => {
    const FakeBuffer = fakeBuffer();
    const profiler = new PackageProfiler();
    profiler.instrumentBufferSaves(FakeBuffer);
    profiler.ownerForSite = () => 'whitespace';
    profiler.start();

    const buffer = new FakeBuffer();
    buffer.onWillSave(() => {});
    buffer.onDidSave(() => {});
    buffer.will[0]();
    buffer.did[0]();

    const entry = profiler.report()[0];
    assert.strictEqual(entry.owner, 'whitespace');
    assert.strictEqual(entry.byKind.save.count, 2);
  });

  it('times an async will-save until it settles, since the save waits on it', async () => {
    const FakeBuffer = fakeBuffer();
    const profiler = new PackageProfiler();
    profiler.instrumentBufferSaves(FakeBuffer);
    profiler.ownerForSite = () => 'formatter';
    profiler.start();

    const buffer = new FakeBuffer();
    let resolve;
    buffer.onWillSave(() => new Promise(r => (resolve = r)));
    const pending = buffer.will[0]();
    assert.deepEqual(profiler.report(), [], 'nothing recorded while it is pending');

    await new Promise(r => setTimeout(r, 20));
    resolve();
    await pending;
    await null;
    const stats = profiler.report()[0].byKind.save;
    assert.strictEqual(stats.count, 1);
    assert.ok(stats.total >= 15, `waited ${stats.total}ms`);
  });

  it('records a rejected will-save too', async () => {
    const FakeBuffer = fakeBuffer();
    const profiler = new PackageProfiler();
    profiler.instrumentBufferSaves(FakeBuffer);
    profiler.start();
    const buffer = new FakeBuffer();
    buffer.onWillSave(() => Promise.reject(new Error('no')));
    await assert.rejects(buffer.will[0]());
    await null;
    assert.strictEqual(profiler.report()[0].byKind.save.count, 1);
  });

  it('patches the prototype once and passes through while stopped', () => {
    const FakeBuffer = fakeBuffer();
    const profiler = new PackageProfiler();
    profiler.instrumentBufferSaves(FakeBuffer);
    const patched = FakeBuffer.prototype.onWillSave;
    profiler.instrumentBufferSaves(FakeBuffer);
    assert.strictEqual(FakeBuffer.prototype.onWillSave, patched, 'idempotent');

    const buffer = new FakeBuffer();
    let calls = 0;
    buffer.onDidSave(() => calls++);
    buffer.did[0]();
    assert.strictEqual(calls, 1);
    assert.deepEqual(profiler.report(), []);
  });

  it('the environment instruments the real TextBuffer', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src', 'atom-environment.js'), 'utf8');
    assert.match(source, /profiler\.instrumentBufferSaves\(TextBuffer\)/);
    assert.match(source, /this\.packageProfiler = profiler/);
  });
});

describe('config and LSP', () => {
  it('config change listeners are wrapped, not attributed, at subscription', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src', 'config.js'), 'utf8');
    assert.strictEqual(
      (source.match(/profiledListener\(\(\) => \{/g) || []).length,
      2,
      'both the plain and the scoped key path listeners'
    );
    assert.match(source, /profilerModule\.wrap\('config'/);
    assert.doesNotMatch(source, /profiler(Module)?\.attribute\(/);
    assert.match(
      source,
      /process\.type !== 'browser'/,
      'the main process loads config.js and cannot load .ts'
    );
  });

  it('an LSP request reads a stack only while profiling', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src', 'lsp', 'index.js'), 'utf8');
    const body = source.slice(source.indexOf('async function request('));
    const guardAt = body.indexOf('!profiler.enabled) return pending');
    const ownerAt = body.indexOf('profiler.ownerOfCaller()');
    assert.ok(guardAt !== -1 && ownerAt > guardAt, 'the stack is read after the guard');
    assert.match(body, /profiler\.record\('lsp', owner/);
  });

  it('keeps waiting out of the totals', () => {
    const profiler = new PackageProfiler();
    profiler.start();
    profiler.record('lsp', 'symbols-view', 300);
    profiler.record('command', 'symbols-view', 2);
    const entry = profiler.report()[0];
    assert.strictEqual(entry.total, 2);
    assert.strictEqual(entry.byKind.lsp.total, 300, 'but still reports it');
  });
});

describe('measurement', () => {
  it('records nothing while stopped', () => {
    const profiler = new PackageProfiler();
    profiler.record('command', 'tree-view', 5);
    assert.deepEqual(profiler.report(), []);
  });

  it('reports count, total and percentiles per owner and kind', () => {
    const profiler = new PackageProfiler();
    profiler.start();
    for (const ms of [1, 1, 2, 2, 40]) profiler.record('command', 'tree-view', ms);
    profiler.record('event', 'tree-view', 3);
    profiler.record('command', 'github', 100);

    const report = profiler.report();
    assert.strictEqual(report[0].owner, 'github', 'heaviest first');

    const treeView = report.find(r => r.owner === 'tree-view');
    assert.strictEqual(treeView.byKind.command.count, 5);
    assert.strictEqual(treeView.byKind.command.total, 46);
    assert.strictEqual(treeView.byKind.command.max, 40);
    assert.strictEqual(treeView.byKind.command.p95, 40);
    assert.strictEqual(treeView.byKind.event.count, 1);
  });

  it('keeps a bounded number of samples under sustained load', () => {
    const profiler = new PackageProfiler();
    profiler.start();
    for (let i = 0; i < 5000; i++) profiler.record('command', 'noisy', i % 7);
    const stats = profiler.report()[0].byKind.command;
    assert.strictEqual(stats.count, 5000, 'the count is exact');
    assert.ok(stats.p95 <= 6, 'percentiles come from the bounded window');
  });

  it('stops recording when stopped', () => {
    const profiler = new PackageProfiler();
    profiler.start();
    profiler.record('command', 'x', 1);
    profiler.stop();
    profiler.record('command', 'x', 99);
    assert.strictEqual(profiler.report()[0].byKind.command.count, 1);
  });
});

describe('off is free', () => {
  it('measure() does not time when stopped', () => {
    const profiler = new PackageProfiler();
    let calls = 0;
    const value = profiler.measure('command', 'x', () => {
      calls += 1;
      return 'result';
    });
    assert.strictEqual(value, 'result');
    assert.strictEqual(calls, 1);
    assert.deepEqual(profiler.report(), [], 'and records nothing');
  });

  it('capturing a site is cheaper than formatting one', () => {
    // The reason registration uses Error.captureStackTrace rather than
    // new Error().stack: this runs for every command a package registers, on
    // the startup path.
    const profiler = new PackageProfiler();
    const N = 2000;

    let start = process.hrtime.bigint();
    for (let i = 0; i < N; i++) profiler.captureSite();
    const captured = Number(process.hrtime.bigint() - start);

    start = process.hrtime.bigint();
    for (let i = 0; i < N; i++) void new Error().stack;
    const formatted = Number(process.hrtime.bigint() - start);

    assert.ok(
      captured < formatted,
      `capture ${Math.round(captured / 1e6)}ms should beat format ${Math.round(
        formatted / 1e6
      )}ms`
    );
  });

  it('the dispatch path checks the flag before doing anything', () => {
    // Guards the shape rather than the timing: `profiler.enabled` must be the
    // first thing consulted, so a stopped profiler cannot reach record() or
    // ownerForSite() on a hot path.
    const source = fs.readFileSync(
      path.join(ROOT, 'src', 'command-registry.js'),
      'utf8'
    );
    const dispatch = source.slice(source.indexOf('handleCommandEvent(event)'));
    assert.match(dispatch, /if \(profiler\.enabled\)/);
    const guardAt = dispatch.indexOf('if (profiler.enabled)');
    const recordAt = dispatch.indexOf('profiler.record(');
    assert.ok(guardAt !== -1 && recordAt > guardAt, 'record is inside the guard');
  });

  it('registration captures a site without formatting it', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'src', 'command-registry.js'),
      'utf8'
    );
    assert.match(source, /profiler\.captureSite\(/);
    assert.doesNotMatch(
      source,
      /profiler\.attribute\(/,
      'attribute() reads a formatted stack; it must not run at registration'
    );
  });
});

describe('subscriber wrapping', () => {
  it('passes through untouched while stopped', () => {
    const profiler = new PackageProfiler();
    let calls = 0;
    const wrapped = profiler.wrap('event', function(x) {
      calls += 1;
      return x * 2;
    });
    assert.strictEqual(wrapped(21), 42);
    assert.strictEqual(calls, 1);
    assert.deepEqual(profiler.report(), []);
  });

  it('preserves the receiver and arguments', () => {
    const profiler = new PackageProfiler();
    profiler.start();
    const wrapped = profiler.wrap('event', function(a, b) {
      return [this.tag, a, b].join('-');
    });
    assert.strictEqual(wrapped.call({ tag: 'ctx' }, 1, 2), 'ctx-1-2');
  });

  it('leaves a non-function alone', () => {
    const profiler = new PackageProfiler();
    assert.strictEqual(profiler.wrap('event', null), null);
  });
});

describe('attribution windows', () => {
  it('bills work with no visible caller to the callback that is running', () => {
    // A blocking IPC round trip cannot see who asked for it. Rather than pay
    // for a stack per call, it lands on whichever wrapped callback is open.
    const profiler = new PackageProfiler();
    profiler.start();
    profiler.ownerForSite = () => 'tree-view';
    const wrapped = profiler.wrap('event', () => {
      profiler.recordCurrent('ipc', 7);
    });
    wrapped();

    const entry = profiler.report()[0];
    assert.strictEqual(entry.owner, 'tree-view');
    assert.strictEqual(entry.byKind.ipc.count, 1);
    assert.strictEqual(entry.byKind.ipc.total, 7);
    assert.strictEqual(entry.byKind.event.count, 1);
  });

  it('bills work outside any callback to core', () => {
    const profiler = new PackageProfiler();
    profiler.start();
    profiler.recordCurrent('ipc', 3);
    assert.strictEqual(profiler.report()[0].owner, 'core');
  });

  it('restores the previous owner when a window closes', () => {
    const profiler = new PackageProfiler();
    profiler.start();
    let owners = [];
    profiler.ownerForSite = () => 'outer';
    const outer = profiler.wrap('event', () => {
      profiler.ownerForSite = () => 'inner';
      const inner = profiler.wrap('event', () => {
        profiler.recordCurrent('ipc', 1);
      });
      inner();
      profiler.recordCurrent('ipc', 2);
    });
    outer();
    owners = profiler.report().map(entry => entry.owner).sort();
    assert.deepEqual(owners, ['inner', 'outer'], 'the inner window does not leak');
    const outerEntry = profiler.report().find(e => e.owner === 'outer');
    assert.strictEqual(outerEntry.byKind.ipc.total, 2, 'outer keeps its own ipc');
  });

  it('records nothing through a window while stopped', () => {
    const profiler = new PackageProfiler();
    profiler.recordCurrent('ipc', 5);
    assert.deepEqual(profiler.report(), []);
  });
});

describe('decorations', () => {
  it('bills a decoration to the callback that created it', () => {
    // What matters is the count: decorating is cheap once and expensive four
    // hundred times, which is the shape of a package redecorating on every
    // edit.
    const profiler = new PackageProfiler();
    profiler.start();
    profiler.ownerForSite = () => 'git-diff';
    const onDidChange = profiler.wrap('event', () => {
      for (let i = 0; i < 400; i++) profiler.recordCurrent('decoration', 0.01);
    });
    onDidChange();

    const entry = profiler.report()[0];
    assert.strictEqual(entry.owner, 'git-diff');
    assert.strictEqual(entry.byKind.decoration.count, 400);
  });

  it('bills decoration outside any callback to core', () => {
    const profiler = new PackageProfiler();
    profiler.start();
    profiler.recordCurrent('decoration', 0.5);
    assert.strictEqual(profiler.report()[0].owner, 'core');
  });

  it('is guarded so a stopped profiler does no timing', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'src', 'decoration-manager.js'),
      'utf8'
    );
    const matches = source.match(/profiler\.enabled \? performance\.now\(\) : 0/g);
    assert.ok(
      matches && matches.length === 2,
      'both decorate paths must read the clock only when profiling'
    );
    assert.match(source, /if \(profiler\.enabled\) \{\s*\n\s*profiler\.recordCurrent\('decoration'/);
  });
});

describe('report', () => {
  it('renders a table with the running time', () => {
    const text = formatProfilerReport(
      [
        {
          owner: 'tree-view',
          total: 812.5,
          byKind: { command: { count: 412, total: 812.5, p50: 1.2, p95: 6.4, max: 41 } }
        }
      ],
      42
    );
    assert.match(text, /running for 42s/);
    assert.match(text, /tree-view/);
    assert.match(text, /412/);
    assert.match(text, /Total attributed/);
  });

  it('says so when profiling is stopped', () => {
    const text = formatProfilerReport([], null);
    assert.match(text, /stopped/);
  });

  it('shows every kind the profiler records', () => {
    const text = formatProfilerReport(
      [
        {
          owner: 'whitespace',
          total: 3,
          byKind: {
            save: { count: 2, total: 1, p50: 0.5, p95: 0.5, max: 0.5 },
            config: { count: 4, total: 2, p50: 0.5, p95: 0.5, max: 0.5 },
            lsp: { count: 1, total: 120, p50: 120, p95: 120, max: 120 }
          }
        }
      ],
      1
    );
    assert.match(text, /\bsave\b/);
    assert.match(text, /\bconfig\b/);
    assert.match(text, /\blsp\b/);
  });

  it('timecop lists the same kinds, in the same order', () => {
    const { KINDS } = loadTs('src/package-profiler-report.ts');
    const view = fs.readFileSync(
      path.join(ROOT, 'packages', 'timecop', 'lib', 'session-panel-view.js'),
      'utf8'
    );
    const match = /const KIND_ORDER = (\[[^\]]*\]);/.exec(view);
    assert.ok(match, 'session-panel-view.js declares KIND_ORDER');
    assert.deepEqual(JSON.parse(match[1].replace(/'/g, '"')), KINDS);
  });
});
