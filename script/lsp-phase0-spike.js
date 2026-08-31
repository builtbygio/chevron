#!/usr/bin/env node
'use strict';

/**
 * Phase 0 LSP spike: drive a real language server over stdio with the
 * hand-rolled framing codec. Not product code.
 *
 * Usage:
 *   node script/lsp-phase0-spike.js
 *   LSP_SERVER="typescript-language-server --stdio" node script/lsp-phase0-spike.js
 *
 * Requires a server on PATH (default: typescript-language-server --stdio).
 * Exit 0 prints a hover result; exit 2 if server binary missing.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { makeTempDir } = require('./lib/temp-dir');
const {
  encodeMessage,
  LspFrameDecoder,
  parseBody
} = require('../src/lsp/framing');

const ROOT = path.resolve(__dirname, '..');

function parseServerCmd() {
  const raw =
    process.env.LSP_SERVER || 'typescript-language-server --stdio';
  const parts = raw.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  return parts.map(p => p.replace(/^"|"$/g, ''));
}

function which(cmd) {
  const pathEnv = process.env.PATH || '';
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
      : [''];
  for (const dir of pathEnv.split(path.delimiter)) {
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + ext);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch (_) {
        /* continue */
      }
    }
  }
  return null;
}

async function main() {
  const [cmd, ...args] = parseServerCmd();
  if (!which(cmd) && !cmd.includes(path.sep)) {
    console.error(
      `lsp-phase0-spike: server binary not found on PATH: ${cmd}\n` +
        'Install e.g. npm i -g typescript-language-server typescript\n' +
        'Or set LSP_SERVER="path/to/server --stdio"'
    );
    process.exit(2);
  }

  const tmpDir = makeTempDir('chevron-lsp-spike-');
  const filePath = path.join(tmpDir, 'sample.ts');
  const source = [
    'export function greet(name: string): string {',
    '  return "hello " + name;',
    '}',
    '',
    'const x = greet(123);',
    ''
  ].join('\n');
  fs.writeFileSync(filePath, source, 'utf8');
  const fileUri = pathToFileUri(filePath);

  console.error(`[spike] spawning: ${cmd} ${args.join(' ')}`);
  const child = spawn(cmd, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    env: process.env
  });

  const decoder = new LspFrameDecoder();
  const pending = new Map();
  let nextId = 1;
  let stderrBuf = '';

  child.stderr.on('data', d => {
    stderrBuf += d.toString('utf8');
  });

  child.stdout.on('data', chunk => {
    let bodies;
    try {
      bodies = decoder.push(chunk);
    } catch (err) {
      console.error('[spike] framing error', err);
      cleanup(1);
      return;
    }
    for (const body of bodies) {
      let msg;
      try {
        msg = parseBody(body);
      } catch (err) {
        console.error('[spike] JSON parse error', err);
        continue;
      }
      if (msg.id != null && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      } else if (msg.method) {
        // notification — ignore for spike (could log diagnostics)
        if (msg.method === 'textDocument/publishDiagnostics') {
          const diags = (msg.params && msg.params.diagnostics) || [];
          console.error(
            `[spike] diagnostics: ${diags.length} item(s) for ${msg.params.uri}`
          );
        }
      }
    }
  });

  child.on('error', err => {
    console.error('[spike] spawn error', err.message);
    cleanup(1);
  });

  function request(method, params) {
    const id = nextId++;
    const msg = { jsonrpc: '2.0', id, method, params };
    child.stdin.write(encodeMessage(msg));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`timeout waiting for ${method} id=${id}`));
        }
      }, 15000);
    });
  }

  function notify(method, params) {
    child.stdin.write(
      encodeMessage({ jsonrpc: '2.0', method, params })
    );
  }

  function cleanup(code) {
    try {
      child.kill('SIGTERM');
    } catch (_) {
      /* ignore */
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* ignore */
    }
    process.exit(code);
  }

  let tsserverPath = null;
  try {
    tsserverPath = require.resolve('typescript/lib/tsserver.js', {
      paths: [ROOT]
    });
  } catch (_) {
    try {
      tsserverPath = require.resolve('typescript/lib/tsserver.js');
    } catch (_) {
      /* optional */
    }
  }
  if (tsserverPath) {
    console.error(`[spike] tsserver.path=${tsserverPath}`);
  }

  try {
    const init = await request('initialize', {
      processId: process.pid,
      rootUri: pathToFileUri(tmpDir),
      capabilities: {
        textDocument: {
          hover: { contentFormat: ['plaintext', 'markdown'] },
          publishDiagnostics: {}
        }
      },
      workspaceFolders: [{ uri: pathToFileUri(tmpDir), name: 'spike' }],
      initializationOptions: tsserverPath
        ? { tsserver: { path: tsserverPath } }
        : {}
    });
    if (init.error) {
      console.error('[spike] initialize error', init.error);
      cleanup(1);
    }
    console.error('[spike] initialize ok');

    notify('initialized', {});

    notify('textDocument/didOpen', {
      textDocument: {
        uri: fileUri,
        languageId: 'typescript',
        version: 1,
        text: source
      }
    });

    // Give server a moment to analyze
    await new Promise(r => setTimeout(r, 800));

    const hover = await request('textDocument/hover', {
      textDocument: { uri: fileUri },
      position: { line: 0, character: 16 } // on "greet"
    });

    if (hover.error) {
      console.error('[spike] hover error', hover.error);
      cleanup(1);
    }

    console.log('--- hover result ---');
    console.log(JSON.stringify(hover.result, null, 2));

    await request('shutdown', null).catch(() => {});
    notify('exit', undefined);
    console.error('[spike] done');
    if (stderrBuf.trim()) {
      console.error('[spike] server stderr (tail):\n', stderrBuf.slice(-500));
    }
    cleanup(0);
  } catch (err) {
    console.error('[spike] failed:', err.message);
    if (stderrBuf.trim()) {
      console.error('[spike] server stderr:\n', stderrBuf.slice(-1000));
    }
    cleanup(1);
  }
}

function pathToFileUri(p) {
  let resolved = path.resolve(p);
  if (process.platform === 'win32') {
    resolved = resolved.replace(/\\/g, '/');
    if (!resolved.startsWith('/')) resolved = '/' + resolved;
  }
  return 'file://' + encodeURI(resolved).replace(/#/g, '%23');
}

main();
