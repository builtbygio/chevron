#!/usr/bin/env node
'use strict';

/**
 * Cold-start measurement for the packaged app.
 *
 * Phase 0 of docs/startup-snapshot-plan.md: decide whether restoring the
 * custom V8 startup snapshot is worth the effort, using a number rather than
 * an adjective.
 *
 * Launches the packaged app with a throwaway CHEVRON_HOME, attaches over CDP,
 * and reads `atom.getStartupMarkers()` — the internal timeline, relative to
 * process start (`StartupTime.setStartTime()` in main.js). Repeats N times and
 * reports best / median / spread.
 *
 * Usage:
 *   node script/ci/measure-startup.js [--runs 5] [--app <path>] [--json out.json]
 *
 * Each run uses a fresh CHEVRON_HOME and user-data dir, so no config, no
 * restored window state, no compile-cache carry-over between runs. That is a
 * genuine cold start; a warmed one would flatter the result.
 */

const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 9455;
const RUN_TIMEOUT_MS = 90 * 1000;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function findAppBinary(explicit) {
  if (explicit) return explicit;
  const outDir = path.join(REPO_ROOT, 'out');
  if (process.platform === 'darwin') {
    const bundle = fs
      .readdirSync(outDir)
      .filter(n => n.endsWith('.app'))
      .map(n => path.join(outDir, n))[0];
    if (!bundle) throw new Error('no .app bundle in out/');
    const macOS = path.join(bundle, 'Contents', 'MacOS');
    return path.join(macOS, fs.readdirSync(macOS)[0]);
  }
  const dir = fs
    .readdirSync(outDir)
    .filter(n => n.includes('-linux-') || n.includes('-win32-'))
    .map(n => path.join(outDir, n))[0];
  if (!dir) throw new Error('no packaged app in out/');
  return fs
    .readdirSync(dir)
    .map(n => path.join(dir, n))
    .find(p => {
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return fs.statSync(p).isFile();
      } catch (e) {
        return false;
      }
    });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

function jsonList() {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path: '/json/list' }, res => {
        let body = '';
        res.on('data', c => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

// Read markers from the isolated world — with contextIsolation, `atom` lives in
// the preload context, so a main-world evaluate silently sees nothing.
// `window:setup-window:end` is after startEditorWindow() — workspace ready.
// Do not stop at `window:onload:end`: that marker is written when the onload
// handler returns, before the async setupWindow() work finishes. On a fast
// host the harness would otherwise stop ~1s too early.
const TERMINAL_MARKER = /window:setup-window:end|window:environment:start-editor-window:end/;

const MARKERS_EXPR = `(function () {
  if (typeof atom === 'undefined' || !atom.getStartupMarkers) return 'nope:no-atom';
  const m = atom.getStartupMarkers();
  if (!m || !m.length) return 'nope:no-markers';
  const done = m.some(x => ${TERMINAL_MARKER}.test(x.label));
  if (!done) return 'nope:' + m.map(x => x.label).join(',');
  return JSON.stringify({
    markers: m,
    snapshot: typeof snapshotResult !== 'undefined' && snapshotResult ? true : false
  });
})()`;

let lastSeen = '(never reached renderer)';

async function probe() {
  let targets;
  try {
    targets = await jsonList();
  } catch (e) {
    return null;
  }
  const page = targets.find(t => t.type === 'page' && /index\.html/.test(t.url));
  if (!page) return null;

  const ws = new WebSocket(page.webSocketDebuggerUrl, {
    maxPayload: 64 * 1024 * 1024
  });
  try {
    await new Promise((res, rej) => {
      ws.once('open', res);
      ws.once('error', rej);
    });
    let id = 0;
    const pending = new Map();
    const contexts = [];
    ws.on('message', raw => {
      const msg = JSON.parse(raw);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result);
        pending.delete(msg.id);
      } else if (msg.method === 'Runtime.executionContextCreated') {
        contexts.push(msg.params.context.id);
      }
    });
    const call = (method, params = {}) =>
      new Promise(res => {
        const i = ++id;
        pending.set(i, res);
        ws.send(JSON.stringify({ id: i, method, params }));
      });

    await call('Runtime.enable');
    await delay(300);
    for (const contextId of contexts) {
      const r = await call('Runtime.evaluate', {
        expression: MARKERS_EXPR,
        returnByValue: true,
        contextId
      });
      const v = r && r.result && r.result.value;
      if (typeof v === 'string' && v.startsWith('nope:')) {
        lastSeen = v.slice(5);
        continue;
      }
      if (v) return JSON.parse(v);
    }
    return null;
  } finally {
    ws.close();
  }
}

async function gracefulQuit(app) {
  try {
    const targets = await jsonList();
    const page = targets.find(t => t.type === 'page' && /index\.html/.test(t.url));
    if (page) {
      const ws = new WebSocket(page.webSocketDebuggerUrl, {
        maxPayload: 64 * 1024 * 1024
      });
      await new Promise((res, rej) => {
        ws.once('open', res);
        ws.once('error', rej);
      });
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression:
              '(function(){ try { if (typeof atom !== "undefined") { if (atom.saveBlobStoreSync) atom.saveBlobStoreSync(); if (atom.close) atom.close(); } } catch (e) {} try { window.close(); } catch (e) {} })()',
            returnByValue: true
          }
        })
      );
      await delay(200);
      ws.close();
    }
  } catch (e) {
    /* CDP already gone */
  }
  try {
    app.kill('SIGTERM');
  } catch (e) {
    /* gone */
  }
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (app.exitCode != null) break;
    await delay(100);
  }
}

async function singleRun(binary, runIndex, reuseHome) {
  const home =
    reuseHome || fs.mkdtempSync(path.join(os.tmpdir(), `chevron-cold-${runIndex}-`));
  fs.mkdirSync(path.join(home, 'electronUserData'), { recursive: true });

  const t0 = Date.now();
  const app = childProcess.spawn(
    binary,
    [
      `--remote-debugging-port=${PORT}`,
      '--user-data-dir=' + path.join(home, 'electronUserData')
    ],
    {
      env: Object.assign({}, process.env, {
        CHEVRON_HOME: home,
        ATOM_HOME: home
      }),
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  let out = '';
  app.stdout.on('data', c => (out += c));
  app.stderr.on('data', c => (out += c));
  let exited = false;
  app.on('exit', () => (exited = true));

  try {
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (exited) throw new Error(`app exited early:\n${out.slice(-1500)}`);
      const state = await probe();
      if (state) {
        const wall = Date.now() - t0;
        await gracefulQuit(app);
        return { wall, home, ...state };
      }
      await delay(250);
    }
    throw new Error(`timeout after ${RUN_TIMEOUT_MS}ms\n${out.slice(-1500)}`);
  } finally {
    try {
      if (!exited) app.kill('SIGKILL');
    } catch (e) {
      /* gone */
    }
    await delay(1500); // let the port free before the next run
    if (!reuseHome && !arg('keep-home', null)) {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }
}

function stats(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return {
    best: s[0],
    median: s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2),
    worst: s[s.length - 1]
  };
}

async function main() {
  const runs = parseInt(arg('runs', '5'), 10);
  const binary = findAppBinary(arg('app', null));
  console.log(`measuring: ${binary}`);
  console.log(
    arg('home', null)
      ? `runs: ${runs} (REUSED home ${arg('home', null)} — warm compile cache)\n`
      : `runs: ${runs} (fresh CHEVRON_HOME each — cold compile cache)\n`
  );

  const results = [];
  for (let i = 0; i < runs; i++) {
    process.stdout.write(`  run ${i + 1}/${runs} … `);
    try {
      const r = await singleRun(binary, i, arg('home', null));
      results.push(r);
      console.log(`${r.wall} ms`);
    } catch (e) {
      // Print the whole diagnostic: the first line alone hides the marker
      // trail and the app's stderr, which is where the cause actually is.
      console.log('FAILED');
      for (const line of String(e.message).split('\n')) {
        console.log(`      ${line}`);
      }
    }
  }

  if (!results.length) {
    console.error('\nno successful runs');
    process.exit(1);
  }

  const wall = stats(results.map(r => r.wall));
  console.log('\n─── cold start (process spawn → workspace ready) ───');
  console.log(`  best   ${wall.best} ms`);
  console.log(`  median ${wall.median} ms`);
  console.log(`  worst  ${wall.worst} ms`);
  console.log(`  custom V8 snapshot in use: ${results[0].snapshot ? 'YES' : 'NO (stock)'}`);

  // Marker breakdown from the best run — where the time actually goes.
  const best = results.reduce((a, b) => (a.wall <= b.wall ? a : b));
  console.log('\n─── marker timeline (best run, ms since process start) ───');
  let prev = 0;
  for (const m of best.markers) {
    const delta = m.time - prev;
    console.log(
      `  ${String(m.time).padStart(6)} ms  (+${String(delta).padStart(5)})  ${m.label}`
    );
    prev = m.time;
  }

  // Threshold from docs/startup-snapshot-plan.md §4.
  const v = wall.median;
  console.log('\n─── snapshot-plan §4 decision gate ───');
  if (v > 2500) {
    console.log(`  ${v} ms > 2500 ms → RESTORE the custom snapshot (Phase 1)`);
  } else if (v >= 1200) {
    console.log(`  ${v} ms in 1200–2500 ms → try §7 cheaper alternatives first`);
  } else {
    console.log(`  ${v} ms < 1200 ms → CLOSE as won't-fix-now; publish the number`);
  }

  const jsonPath = arg('json', null);
  if (jsonPath) {
    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          binary,
          platform: process.platform,
          arch: process.arch,
          cpu: (os.cpus()[0] || {}).model,
          cores: os.cpus().length,
          warmHome: Boolean(arg('home', null)),
          wall,
          results
        },
        null,
        2
      )
    );
    console.log(`\nwrote ${jsonPath}`);
  }
}

main().catch(e => {
  console.error(e.stack || e);
  process.exit(1);
});
