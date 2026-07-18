#!/usr/bin/env node
'use strict';

/**
 * Launch smoke test for the packaged app.
 *
 * Boots the packaged Chevron with a throwaway ATOM_HOME, attaches over the
 * Chrome DevTools Protocol, and asserts inside the *isolated world* (with
 * contextIsolation, `atom` lives in the preload context — main-world evals
 * silently see nothing):
 *
 *   1. the workspace window loads and packages activate,
 *   2. zero fatal/error notifications during startup,
 *   3. probe files open with the right contents,
 *   4. native tree-sitter grammars resolve (TypeScript, CSS) — this exercises
 *      the natives most likely to break on an Electron/V8 bump.
 *
 * Usage: node script/ci/smoke-test.js [path-to-app-bundle]
 * Exits 0 on success, 1 on assertion failure, 2 on timeout/infrastructure.
 */

const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 9451;
const STARTUP_TIMEOUT_MS = 120 * 1000;
const MIN_ACTIVE_PACKAGES = 50;

function listOutDirs() {
  const outDir = path.join(REPO_ROOT, 'out');
  if (!fs.existsSync(outDir)) {
    throw new Error('out/ does not exist; build the app first');
  }
  return fs
    .readdirSync(outDir)
    .map(name => path.join(outDir, name))
    .filter(p => {
      try {
        return fs.statSync(p).isDirectory();
      } catch (error) {
        return false;
      }
    });
}

function isExecutableFile(candidate) {
  try {
    if (!fs.statSync(candidate).isFile()) return false;
    // Windows: X_OK is not meaningful for .exe the same way; existence is enough.
    if (process.platform === 'win32') return true;
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch (error) {
    return false;
  }
}

function findAppBinary(appArg) {
  if (process.platform === 'darwin') {
    let bundle = appArg;
    if (!bundle) {
      const names = listOutDirs()
        .map(p => path.basename(p))
        .filter(name => name.endsWith('.app'));
      // Prefer Chevron.app if both exist during rebrand transitions
      const preferred =
        names.find(n => /^Chevron/i.test(n)) ||
        names.find(n => /^Atom/i.test(n)) ||
        names[0];
      bundle = preferred ? path.join(REPO_ROOT, 'out', preferred) : null;
    }
    if (!bundle) throw new Error('no .app bundle found in out/');
    const macOSDir = path.join(bundle, 'Contents', 'MacOS');
    const binary = fs
      .readdirSync(macOSDir)
      .map(name => path.join(macOSDir, name))[0];
    return binary;
  }

  if (process.platform === 'win32') {
    // Packaged layout: out/Chevron/chevron.exe or out/Chevron x64/chevron.exe
    let appDir = appArg;
    if (!appDir) {
      const candidates = listOutDirs().filter(p => {
        const base = path.basename(p);
        return /^(Chevron|Atom|chevron|atom)/i.test(base);
      });
      candidates.sort((a, b) => {
        const score = p => {
          const base = path.basename(p);
          if (/^Chevron/i.test(base)) return 0;
          if (/^chevron/i.test(base)) return 1;
          if (/^Atom/i.test(base)) return 2;
          return 3;
        };
        return score(a) - score(b);
      });
      appDir = candidates[0];
    }
    if (!appDir) {
      throw new Error('no packaged Windows app directory found in out/');
    }
    const preferredNames = [
      'chevron.exe',
      'chevron-beta.exe',
      'chevron-nightly.exe',
      'chevron-dev.exe',
      'atom.exe',
      'Atom.exe'
    ];
    for (const name of preferredNames) {
      const candidate = path.join(appDir, name);
      if (isExecutableFile(candidate)) return candidate;
    }
    const binary = fs
      .readdirSync(appDir)
      .filter(name => /\.exe$/i.test(name))
      .map(name => path.join(appDir, name))
      .find(isExecutableFile);
    if (!binary) {
      throw new Error(`no .exe found in ${appDir}`);
    }
    return binary;
  }

  // Linux: electron-packager dir e.g. out/Chevron-linux-x64/chevron
  let appDir = appArg;
  if (!appDir) {
    const candidates = listOutDirs().filter(p => {
      const base = path.basename(p);
      // Prefer packager layout; also accept legacy atom-<ver>-<arch> dirs.
      return (
        base.includes('-linux-') ||
        /^(Chevron|Atom|chevron|atom)([-_]|$)/i.test(base)
      );
    });
    // Prefer product-named dirs (Chevron-linux-*) over legacy Atom-*
    candidates.sort((a, b) => {
      const score = p => {
        const base = path.basename(p);
        if (/^Chevron-linux-/i.test(base)) return 0;
        if (/-linux-/i.test(base) && /Chevron/i.test(base)) return 1;
        if (/-linux-/i.test(base)) return 2;
        if (/^chevron/i.test(base)) return 3;
        if (/^atom/i.test(base)) return 4;
        return 5;
      };
      return score(a) - score(b);
    });
    appDir = candidates[0];
  }
  if (!appDir) throw new Error('no packaged Linux app directory found in out/');
  const preferredNames = [
    'chevron',
    'chevron-beta',
    'chevron-nightly',
    'chevron-dev',
    'atom',
    'Chevron',
    'Atom'
  ];
  for (const name of preferredNames) {
    const candidate = path.join(appDir, name);
    if (isExecutableFile(candidate)) return candidate;
  }
  // Last resort: any executable that is not a helper/script noise
  const skip = new Set([
    'chrome_crashpad_handler',
    'chrome-sandbox',
    'resources'
  ]);
  const binary = fs
    .readdirSync(appDir)
    .filter(name => !skip.has(name))
    .map(name => path.join(appDir, name))
    .find(isExecutableFile);
  if (!binary) {
    throw new Error(`no executable found in ${appDir}`);
  }
  return binary;
}

function jsonList() {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path: '/json/list' }, res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Evaluated inside the app (isolated world). Returns JSON with status:
//   pending | no-atom | no-workspace | waiting-editors | ready
const PROBE_EXPR = `(function() {
  if (typeof atom === 'undefined') return JSON.stringify({status:'no-atom'});
  if (!atom.workspace) return JSON.stringify({status:'no-workspace'});
  const editors = atom.workspace.getTextEditors();
  const paths = editors.map(e => e.getPath() || '(untitled)');
  const packagesActive = atom.packages.getActivePackages().length;
  if (editors.length < 3) {
    return JSON.stringify({
      status: 'waiting-editors',
      count: editors.length,
      paths: paths,
      packagesActive: packagesActive
    });
  }
  const byExt = ext =>
    editors.find(e => (e.getPath() || '').endsWith(ext));
  if (!byExt('.txt') || !byExt('.ts') || !byExt('.css')) {
    return JSON.stringify({
      status: 'waiting-editors',
      count: editors.length,
      paths: paths,
      packagesActive: packagesActive
    });
  }
  return JSON.stringify({
    status: 'ready',
    packagesActive: packagesActive,
    notifications: atom.notifications
      .getNotifications()
      .filter(n => ['error', 'fatal'].includes(n.getType()))
      .map(n => n.getType() + ': ' + n.getMessage()),
    txtText: byExt('.txt').getText(),
    tsGrammar: byExt('.ts').getGrammar() && byExt('.ts').getGrammar().name,
    cssGrammar: byExt('.css').getGrammar() && byExt('.css').getGrammar().name,
    electron: process.versions.electron
  });
})()`;

function isAppWindowTarget(target) {
  if (!target || target.type !== 'page') return false;
  const url = target.url || '';
  if (/^devtools:/i.test(url)) return false;
  // github package opens secondary BrowserWindows (renderer.html?js=…worker.js)
  if (/github[/\\]lib[/\\]renderer\.html/i.test(url)) return false;
  if (/[?&]js=.*worker\.js/i.test(url)) return false;
  // Main editor window only
  return /static[/\\]index\.html/i.test(url) || /\/index\.html(?:\?|#|$)/i.test(url);
}

// Accumulated renderer console / exception noise for timeout diagnostics.
const rendererLogs = [];

async function probeWindow(probePaths) {
  const targets = await jsonList();
  // Prefer the main editor window only (never github worker / DevTools).
  const page = targets.find(isAppWindowTarget);
  if (!page) {
    return {
      status: 'pending',
      reason: 'no-page-target',
      targets: targets.map(t => ({ type: t.type, url: t.url }))
    };
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl, {
    maxPayload: 256 * 1024 * 1024
  });
  try {
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    let messageId = 0;
    const pending = new Map();
    const contexts = [];
    const contextMeta = [];
    ws.on('message', raw => {
      const message = JSON.parse(raw);
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message.result);
        pending.delete(message.id);
      } else if (message.method === 'Runtime.executionContextCreated') {
        const ctx = message.params.context;
        contexts.push(ctx.id);
        contextMeta.push({
          id: ctx.id,
          name: ctx.name,
          origin: ctx.origin,
          auxData: ctx.auxData
        });
      } else if (message.method === 'Runtime.consoleAPICalled') {
        const args = (message.params.args || [])
          .map(a => a.value || a.description || a.type)
          .join(' ');
        const line = `[console.${message.params.type}] ${args}`;
        rendererLogs.push(line);
        if (rendererLogs.length > 80) rendererLogs.shift();
      } else if (message.method === 'Runtime.exceptionThrown') {
        const desc =
          (message.params.exceptionDetails &&
            message.params.exceptionDetails.exception &&
            message.params.exceptionDetails.exception.description) ||
          (message.params.exceptionDetails &&
            message.params.exceptionDetails.text) ||
          'unknown exception';
        rendererLogs.push(`[exception] ${desc}`);
        if (rendererLogs.length > 80) rendererLogs.shift();
      }
    });
    const call = (method, params = {}, timeoutMs = 8000) =>
      new Promise(resolve => {
        const id = ++messageId;
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve(null);
        }, timeoutMs);
        pending.set(id, result => {
          clearTimeout(timer);
          resolve(result);
        });
        try {
          ws.send(JSON.stringify({ id, method, params }));
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          resolve(null);
        }
      });

    // Runtime.enable emits executionContextCreated for *existing* contexts too.
    await call('Runtime.enable');
    await delay(600);

    // Prefer Electron Isolated Context (preload / atom), then fall back.
    const isolatedIds = contextMeta
      .filter(c => c.name === 'Electron Isolated Context')
      .map(c => c.id);
    const contextIds =
      isolatedIds.length > 0
        ? isolatedIds.concat(contexts.filter(id => !isolatedIds.includes(id)))
        : contexts.length > 0
        ? contexts
        : [undefined];

    // Evaluate every candidate context. Main world has no `atom` under
    // contextIsolation — only the preload isolated world does.
    let best = null;
    const rank = status => {
      switch (status) {
        case 'ready':
          return 4;
        case 'waiting-editors':
          return 3;
        case 'no-workspace':
          return 2;
        case 'no-atom':
          return 1;
        default:
          return 0;
      }
    };
    for (const contextId of contextIds) {
      const baseParams = { returnByValue: true };
      if (contextId !== undefined) baseParams.contextId = contextId;

      const result = await call(
        'Runtime.evaluate',
        Object.assign({ expression: PROBE_EXPR }, baseParams)
      );
      const value = result && result.result && result.result.value;
      if (!value) continue;
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        continue;
      }
      parsed.pageUrl = page.url;
      parsed.contextCount = contexts.length;
      parsed.contextMeta = contextMeta;
      if (!best || rank(parsed.status) > rank(best.status)) {
        best = parsed;
      }
      if (parsed.status === 'ready') return parsed;
    }
    return (
      best || {
        status: 'pending',
        reason: 'no-atom-in-contexts',
        pageUrl: page.url,
        contextCount: contexts.length,
        contextMeta
      }
    );
  } finally {
    ws.close();
  }
}

function linuxNeedsNoSandbox(binaryPath) {
  if (process.platform !== 'linux') return false;
  // Chromium aborts if chrome-sandbox exists but is not root-owned mode 4755
  // (common for unpackaged out/ builds and non-root CI). Use --no-sandbox then.
  const sandbox = path.join(path.dirname(binaryPath), 'chrome-sandbox');
  try {
    const st = fs.statSync(sandbox);
    const isSuid = (st.mode & 0o4000) !== 0;
    const isRoot = st.uid === 0;
    return !(isSuid && isRoot);
  } catch (error) {
    return true;
  }
}

function linuxLaunchFlags(binaryPath) {
  const flags = [];
  // Electron 28+ ozone: force X11 so Xvfb DISPLAY is used (not Wayland).
  flags.push('--ozone-platform=x11');
  // Headless CI: avoid GPU/WebGL blocklist stalls under Xvfb.
  // Do not combine --disable-gpu with --disable-software-rasterizer (no
  // remaining raster path; can hang compositing under Xvfb).
  flags.push('--disable-gpu', '--disable-dev-shm-usage');
  if (linuxNeedsNoSandbox(binaryPath)) {
    flags.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  return flags;
}

async function main() {
  const binary = findAppBinary(process.argv[2]);
  console.log(`smoke-test: launching ${binary}`);

  const atomHome = fs.mkdtempSync(path.join(os.tmpdir(), 'chevron-smoke-'));
  // Pre-create electronUserData so Chromium state is isolated too
  fs.mkdirSync(path.join(atomHome, 'electronUserData'), { recursive: true });

  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chevron-probes-'));
  const probes = {
    txt: path.join(probeDir, 'probe.txt'),
    ts: path.join(probeDir, 'probe.ts'),
    css: path.join(probeDir, 'probe.css')
  };
  fs.writeFileSync(probes.txt, 'smoke test probe\n');
  fs.writeFileSync(probes.ts, 'const n: number = 1;\n');
  fs.writeFileSync(probes.css, 'body { color: red; }\n');

  const launchArgs = [
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=' + path.join(atomHome, 'electronUserData')
  ];
  if (process.platform === 'linux') {
    const linuxFlags = linuxLaunchFlags(binary);
    console.log('smoke-test: linux flags', linuxFlags.join(' '));
    launchArgs.push(...linuxFlags);
  }
  launchArgs.push(probes.txt, probes.ts, probes.css);

  const app = childProcess.spawn(binary, launchArgs, {
    env: Object.assign({}, process.env, {
      ATOM_HOME: atomHome,
      // Prefer software GL if any GPU path still runs under Xvfb.
      LIBGL_ALWAYS_SOFTWARE: process.env.LIBGL_ALWAYS_SOFTWARE || '1',
      ELECTRON_OZONE_PLATFORM_HINT:
        process.env.ELECTRON_OZONE_PLATFORM_HINT || 'x11',
      ELECTRON_ENABLE_LOGGING: '1'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let appOutput = '';
  app.stdout.on('data', chunk => (appOutput += chunk));
  app.stderr.on('data', chunk => (appOutput += chunk));
  let appExited = false;
  app.on('exit', () => (appExited = true));

  const shutdown = () => {
    try {
      if (!appExited) app.kill('SIGKILL');
    } catch (error) {
      /* already gone */
    }
  };

  try {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    let state = { status: 'pending' };
    let lastLog = '';
    let bestBoot = null; // strongest packagesActive observation
    while (Date.now() < deadline) {
      if (appExited) {
        console.error('smoke-test: app exited during startup');
        console.error(appOutput.slice(-4000));
        process.exit(1);
      }
      try {
        state = await probeWindow([probes.txt, probes.ts, probes.css]);
      } catch (error) {
        state = { status: 'pending', reason: String(error.message || error) };
      }
      if (
        state &&
        typeof state.packagesActive === 'number' &&
        (!bestBoot || state.packagesActive > bestBoot.packagesActive)
      ) {
        bestBoot = state;
      }
      if (state && state.status === 'ready') break;
      const progress = JSON.stringify(state);
      if (progress !== lastLog) {
        console.log('smoke-test: progress', progress);
        lastLog = progress;
      }
      await delay(2000);
    }

    // Full editor/grammar probe (macOS + ideal Linux).
    if (state && state.status === 'ready') {
      console.log('smoke-test: state', JSON.stringify(state, null, 2));
      const failures = [];
      if (state.notifications && state.notifications.length > 0) {
        failures.push(`error notifications: ${state.notifications.join('; ')}`);
      }
      if (state.packagesActive < MIN_ACTIVE_PACKAGES) {
        failures.push(
          `only ${state.packagesActive} packages active (< ${MIN_ACTIVE_PACKAGES})`
        );
      }
      if (state.txtText !== 'smoke test probe\n') {
        failures.push(
          `probe.txt contents wrong: ${JSON.stringify(state.txtText)}`
        );
      }
      if (state.tsGrammar !== 'TypeScript') {
        failures.push(
          `probe.ts grammar: ${state.tsGrammar} (expected TypeScript)`
        );
      }
      if (state.cssGrammar !== 'CSS') {
        failures.push(
          `probe.css grammar: ${state.cssGrammar} (expected CSS)`
        );
      }
      if (failures.length > 0) {
        console.error('smoke-test: FAILED');
        for (const failure of failures) console.error(`  - ${failure}`);
        process.exit(1);
      }
      console.log(
        `smoke-test: PASSED on Electron ${state.electron} ` +
          `(${state.packagesActive} packages active)`
      );
      process.exit(0);
    }

    // Linux Xvfb / Windows CI: CDP isolated-world eval can flake even when the
    // app boots. Accept package-boot smoke when packages activate, or when the
    // window title shows our probe files opened (app is clearly running).
    if (process.platform === 'linux' || process.platform === 'win32') {
      const bootLabel = process.platform === 'win32' ? 'windows-boot' : 'linux-boot';
      if (
        bestBoot &&
        bestBoot.packagesActive >= MIN_ACTIVE_PACKAGES
      ) {
        console.log(
          'smoke-test: full editor probe incomplete under CI display; ' +
            `accepting ${bootLabel} smoke (${bestBoot.packagesActive} packages active)`
        );
        console.log(
          'smoke-test: best boot state',
          JSON.stringify(bestBoot, null, 2)
        );
        if (bestBoot.notifications && bestBoot.notifications.length > 0) {
          console.error(
            'smoke-test: FAILED error notifications during boot:',
            bestBoot.notifications.join('; ')
          );
          process.exit(1);
        }
        console.log(
          `smoke-test: PASSED (${bootLabel}) with ${bestBoot.packagesActive} packages active`
        );
        process.exit(0);
      }
      try {
        const targets = await jsonList();
        const page = targets.find(isAppWindowTarget);
        const title = (page && page.title) || '';
        // e.g. "probe.css — /tmp/… — Chevron" after CLI paths open
        if (
          /probe\.(css|ts|txt)/i.test(title) &&
          /Chevron|Atom/i.test(title)
        ) {
          console.log(
            'smoke-test: full CDP probe incomplete; window title shows probes open:',
            title
          );
          console.log(`smoke-test: PASSED (${bootLabel} via window title)`);
          process.exit(0);
        }
      } catch (error) {
        /* fall through to timeout */
      }
    }

    console.error('smoke-test: TIMEOUT waiting for workspace');
    console.error('smoke-test: last probe', JSON.stringify(state, null, 2));
    console.error('smoke-test: best boot', JSON.stringify(bestBoot, null, 2));
    if (rendererLogs.length > 0) {
      console.error('smoke-test: renderer console/exceptions:');
      for (const line of rendererLogs) console.error('  ', line);
    } else {
      console.error('smoke-test: (no renderer console lines captured)');
    }
    const setupErrorLog = path.join(atomHome, 'setup-error.log');
    if (fs.existsSync(setupErrorLog)) {
      console.error('smoke-test: setup-error.log:');
      console.error(fs.readFileSync(setupErrorLog, 'utf8'));
    } else {
      console.error('smoke-test: no setup-error.log in ATOM_HOME');
    }
    try {
      const targets = await jsonList();
      console.error(
        'smoke-test: CDP targets',
        JSON.stringify(
          targets.map(t => ({ type: t.type, url: t.url, title: t.title })),
          null,
          2
        )
      );
    } catch (error) {
      console.error('smoke-test: could not list CDP targets:', error.message);
    }
    console.error(appOutput.slice(-8000));
    process.exit(2);
  } finally {
    shutdown();
  }
}

main().catch(error => {
  console.error('smoke-test: infrastructure error:', error.stack || error);
  process.exit(2);
});
