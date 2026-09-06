'use strict';

/**
 * Start the packaged application and attach Playwright to it.
 *
 * Not `_electron.launch`. That attaches to the Electron main process through
 * the Node inspector, and the packaged app flips
 * `EnableNodeCliInspectArguments: false` (script/lib/flip-electron-fuses.js),
 * so the attach never completes — testing an unfused build instead would mean
 * not testing what ships.
 *
 * The remote debugging port is not affected by that fuse, and it is how
 * script/ci/smoke-test.js already drives the app, so we spawn the binary the
 * same way and connect over CDP.
 *
 * docs/process/test-runner-migration.md — Phase 2.
 */

const path = require('path');
const net = require('net');
const childProcess = require('child_process');
const { chromium } = require('playwright');
const { findPackagedApp } = require('../lib/find-packaged-app');
const { makeTempDir } = require('../lib/temp-dir');

const OUT_DIR = path.resolve(__dirname, '..', '..', 'out');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForEndpoint(port, deadlineMs) {
  const url = `http://127.0.0.1:${port}/json/version`;
  const started = Date.now();
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      // not listening yet
    }
    if (Date.now() - started > deadlineMs) {
      throw new Error(`no debugging endpoint on ${port} after ${deadlineMs}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

async function launchChevron({ args = [], env = {}, timeout = 90000, prepareHome = null } = {}) {
  const executablePath = findPackagedApp({ outDir: OUT_DIR });
  if (!executablePath) {
    throw new Error(`no packaged application under ${OUT_DIR} — run script/build`);
  }

  const home = makeTempDir('chevron-e2e-');
  if (typeof prepareHome === 'function') prepareHome(home);
  const port = await freePort();

  const child = childProcess.spawn(
    executablePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${path.join(home, 'electronUserData')}`,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      ...args
    ],
    {
      env: { ...process.env, CHEVRON_HOME: home, ATOM_HOME: home, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    }
  );

  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  const close = async () => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      try { child.kill('SIGKILL'); } catch (_) { /* already gone */ }
    }
  };

  try {
    await waitForEndpoint(port, timeout);
  } catch (error) {
    await close();
    throw new Error(`${error.message}\napp output:\n${output.slice(-2000)}`);
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const window =
    context.pages().find(page => /index\.html/.test(page.url())) ||
    (await context.waitForEvent('page', { timeout }));

  return {
    window,
    home,
    output: () => output,
    close: async () => {
      try { await browser.close(); } catch (error) { /* app may be gone */ }
      await close();
    }
  };
}

module.exports = { launchChevron };
