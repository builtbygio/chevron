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
});
