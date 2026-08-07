'use strict';

/**
 * Renderer-side LSP client (Phase 1 + Phase 2).
 * Diagnostics, document sync, hover, definition, completion for TypeScript
 * when the project is trusted.
 */

const { CompositeDisposable, Emitter } = require('event-kit');
const { ipcRenderer } = require('electron');
const { DocumentSync } = require('./document-sync');
const { isTypescriptScope } = require('./language-id');
const { pathToUri } = require('./path-uri');
const { resolveBuiltinServer } = require('./builtin-servers');
const { hoverAt } = require('./providers/hover');
const { definitionAt } = require('./providers/definitions');
const { createAutocompleteProvider } = require('./providers/autocomplete');

let activated = false;
let disposables = null;
let emitter = null;
let documentSync = null;
/** uri -> Diagnostic[] */
const diagnosticsByUri = new Map();
/** projectRoot -> serverId started */
const startedRoots = new Map();
/** completion latency samples (ms) for Phase 2 measurement */
const completionLatencySamples = [];
const MAX_LATENCY_SAMPLES = 200;

const clientApi = {
  request,
  getServerIdForEditor,
  recordCompletionLatency
};

function getResourcePath() {
  try {
    const { resourcePath } = require('../get-window-load-settings')();
    return resourcePath;
  } catch (_) {
    return null;
  }
}

function projectRootForEditor(editor) {
  const filePath = editor.getPath && editor.getPath();
  if (!filePath || !global.chevron || !global.chevron.project) return null;
  const dirs = global.chevron.project.getDirectories
    ? global.chevron.project.getDirectories()
    : [];
  for (const dir of dirs) {
    const dirPath = dir.getPath && dir.getPath();
    if (dirPath && filePath.startsWith(dirPath)) return dirPath;
  }
  const path = require('path');
  return path.dirname(filePath);
}

function getServerIdForEditor(editor) {
  const root = projectRootForEditor(editor);
  return root ? startedRoots.get(root) || null : null;
}

async function request(serverId, method, params, timeoutMs) {
  return ipcRenderer.invoke('lsp:request', {
    serverId,
    method,
    params,
    timeoutMs
  });
}

function recordCompletionLatency(ms, count) {
  completionLatencySamples.push({ ms, count, t: Date.now() });
  if (completionLatencySamples.length > MAX_LATENCY_SAMPLES) {
    completionLatencySamples.shift();
  }
  if (emitter) {
    emitter.emit('did-completion-latency', { ms, count });
  }
}

function getCompletionLatencyStats() {
  if (completionLatencySamples.length === 0) {
    return { n: 0, p50: null, p95: null, mean: null };
  }
  const sorted = completionLatencySamples.map(s => s.ms).sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const p50 = sorted[Math.floor(n * 0.5)];
  const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))];
  return { n, p50, p95, mean: Math.round(mean) };
}

async function ensureServerForEditor(editor) {
  const grammar = editor.getGrammar && editor.getGrammar();
  const scope = grammar && grammar.scopeName;
  if (!isTypescriptScope(scope)) return null;

  const projectRoot = projectRootForEditor(editor);
  if (!projectRoot) return null;

  const trusted = await ipcRenderer.invoke('lsp:is-trusted', { projectRoot });
  if (!trusted) {
    emitter.emit('did-change-trust-needed', { projectRoot });
    return null;
  }

  if (startedRoots.has(projectRoot)) {
    return startedRoots.get(projectRoot);
  }

  const builtin = resolveBuiltinServer(scope, {
    resourcePath: getResourcePath()
  });
  if (!builtin) {
    emitter.emit('did-fail-start', {
      projectRoot,
      message:
        'typescript-language-server not found on PATH. Install it or set PATH.'
    });
    return null;
  }

  try {
    await ipcRenderer.invoke('lsp:start-server', {
      serverId: `${builtin.serverId}:${projectRoot}`,
      projectRoot,
      command: builtin.command,
      args: builtin.args,
      rootUri: pathToUri(projectRoot),
      cwd: projectRoot,
      initializationOptions: builtin.initializationOptions
    });
    const serverId = `${builtin.serverId}:${projectRoot}`;
    startedRoots.set(projectRoot, serverId);
    emitter.emit('did-start-server', { serverId, projectRoot });
    return serverId;
  } catch (err) {
    emitter.emit('did-fail-start', {
      projectRoot,
      message: err.message,
      code: err.code
    });
    return null;
  }
}

function handleLspEvent(_event, msg) {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'notification' && msg.method === 'textDocument/publishDiagnostics') {
    const uri = msg.params && msg.params.uri;
    const diagnostics = (msg.params && msg.params.diagnostics) || [];
    if (uri) {
      diagnosticsByUri.set(uri, diagnostics);
      emitter.emit('did-publish-diagnostics', { uri, diagnostics });
    }
    return;
  }

  if (msg.type === 'server-exit') {
    for (const [root, id] of [...startedRoots]) {
      if (id === msg.serverId) startedRoots.delete(root);
    }
    emitter.emit('did-server-exit', msg);
  }
}

async function hoverAtCursor(editor, point) {
  return hoverAt(clientApi, editor, point);
}

async function definitionAtCursor(editor, point) {
  return definitionAt(clientApi, editor, point);
}

function getAutocompleteProvider() {
  return createAutocompleteProvider(clientApi);
}

function activate() {
  if (activated) return exports;
  activated = true;
  disposables = new CompositeDisposable();
  emitter = new Emitter();

  ipcRenderer.invoke('lsp:subscribe').catch(() => {});
  ipcRenderer.on('lsp:event', handleLspEvent);

  documentSync = new DocumentSync({
    notify: (serverId, method, params) => {
      ipcRenderer.invoke('lsp:notify', { serverId, method, params }).catch(() => {});
    },
    getServerIdForEditor
  });

  const env = global.chevron || global.atom;
  if (env && env.workspace) {
    disposables.add(
      env.workspace.observeTextEditors(async editor => {
        const serverId = await ensureServerForEditor(editor);
        if (serverId) documentSync.observeEditor(editor);
      })
    );
  }

  if (env && env.commands) {
    disposables.add(
      env.commands.add('atom-workspace', {
        'chevron-lsp:trust-project': async () => {
          const root =
            env.project &&
            env.project.getPaths &&
            env.project.getPaths()[0];
          if (!root) {
            env.notifications &&
              env.notifications.addWarning('No project folder open');
            return;
          }
          await ipcRenderer.invoke('lsp:set-trust', {
            projectRoot: root,
            trusted: true
          });
          env.notifications &&
            env.notifications.addSuccess(`Trusted project for language servers:\n${root}`);
          for (const editor of env.workspace.getTextEditors()) {
            const serverId = await ensureServerForEditor(editor);
            if (serverId) documentSync.observeEditor(editor);
          }
        },
        'chevron-lsp:untrust-project': async () => {
          const root =
            env.project &&
            env.project.getPaths &&
            env.project.getPaths()[0];
          if (!root) return;
          await ipcRenderer.invoke('lsp:set-trust', {
            projectRoot: root,
            trusted: false
          });
          env.notifications &&
            env.notifications.addInfo('Project untrusted; language servers stopped for new files');
        },
        'chevron-lsp:status': async () => {
          const servers = await ipcRenderer.invoke('lsp:list-servers');
          const trusted = await ipcRenderer.invoke('lsp:list-trusted');
          const lat = getCompletionLatencyStats();
          const latLine =
            lat.n > 0
              ? `Completion latency (n=${lat.n}): p50=${lat.p50}ms p95=${lat.p95}ms mean=${lat.mean}ms`
              : 'Completion latency: no samples yet';
          const lines = [
            `Trusted roots: ${trusted.length}`,
            ...trusted.map(r => `  • ${r}`),
            `Servers: ${servers.length}`,
            ...servers.map(
              s => `  • ${s.serverId} state=${s.state} pid=${s.pid || '?'}`
            ),
            latLine
          ];
          env.notifications &&
            env.notifications.addInfo(lines.join('\n'), { dismissable: true });
        },
        'chevron-lsp:go-to-definition': async () => {
          const editor = env.workspace.getActiveTextEditor();
          if (!editor) return;
          await ensureServerForEditor(editor);
          if (documentSync) documentSync.observeEditor(editor);
          const locations = await definitionAtCursor(editor);
          emitter.emit('did-request-definition', { editor, locations });
        },
        'chevron-lsp:show-hover': async () => {
          const editor = env.workspace.getActiveTextEditor();
          if (!editor) return;
          await ensureServerForEditor(editor);
          if (documentSync) documentSync.observeEditor(editor);
          const hover = await hoverAtCursor(editor);
          emitter.emit('did-request-hover', { editor, hover });
        }
      })
    );
  }

  return exports;
}

function deactivate() {
  if (!activated) return;
  activated = false;
  ipcRenderer.removeListener('lsp:event', handleLspEvent);
  ipcRenderer.invoke('lsp:unsubscribe').catch(() => {});
  if (disposables) disposables.dispose();
  disposables = null;
  diagnosticsByUri.clear();
  startedRoots.clear();
  completionLatencySamples.length = 0;
}

function getDiagnostics(uri) {
  return diagnosticsByUri.get(uri) || [];
}

function onDidPublishDiagnostics(cb) {
  return emitter.on('did-publish-diagnostics', cb);
}

function onDidChangeTrustNeeded(cb) {
  return emitter.on('did-change-trust-needed', cb);
}

function onDidFailStart(cb) {
  return emitter.on('did-fail-start', cb);
}

function onDidRequestHover(cb) {
  return emitter.on('did-request-hover', cb);
}

function onDidRequestDefinition(cb) {
  return emitter.on('did-request-definition', cb);
}

module.exports = {
  activate,
  deactivate,
  getDiagnostics,
  onDidPublishDiagnostics,
  onDidChangeTrustNeeded,
  onDidFailStart,
  onDidRequestHover,
  onDidRequestDefinition,
  hoverAtCursor,
  definitionAtCursor,
  getAutocompleteProvider,
  getCompletionLatencyStats,
  request,
  getServerIdForEditor,
  // test hooks
  _internals: {
    projectRootForEditor,
    diagnosticsByUri,
    startedRoots,
    completionLatencySamples,
    clientApi
  }
};
