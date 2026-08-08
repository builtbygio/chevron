'use strict';

/**
 * Renderer-side LSP client (Phases 1–3).
 * Multi-server registry, diagnostics, hover, definition, completion,
 * signature help, references — when the project is trusted.
 */

const { CompositeDisposable, Emitter } = require('event-kit');
const { ipcRenderer } = require('electron');
const { DocumentSync } = require('./document-sync');
const { pathToUri } = require('./path-uri');
const {
  resolveRegistration,
  resolveCommand,
  registerServer,
  listRegistrations,
  createLspService
} = require('./registry');
const { hoverAt } = require('./providers/hover');
const { definitionAt } = require('./providers/definitions');
const { createAutocompleteProvider } = require('./providers/autocomplete');
const {
  signatureHelpAt,
  formatSignatureHelp
} = require('./providers/signature-help');
const { referencesAt } = require('./providers/references');

let activated = false;
let disposables = null;
let emitter = null;
let documentSync = null;
/** uri -> Diagnostic[] */
const diagnosticsByUri = new Map();
/**
 * Running sessions: key `${regId}::${projectRoot}` ->
 * { serverId, projectRoot, regId, positionEncoding, capabilities }
 */
const startedSessions = new Map();
/** serverId -> positionEncoding */
const encodingByServerId = new Map();
/** completion latency samples (ms) */
const completionLatencySamples = [];
const MAX_LATENCY_SAMPLES = 200;

const clientApi = {
  request,
  getServerIdForEditor,
  getPositionEncoding,
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

function sessionKey(regId, projectRoot) {
  return `${regId}::${projectRoot}`;
}

function getServerIdForEditor(editor) {
  const root = projectRootForEditor(editor);
  if (!root) return null;
  const grammar = editor.getGrammar && editor.getGrammar();
  const scope = grammar && grammar.scopeName;
  if (!scope) return null;
  const reg = resolveRegistration(scope, { resourcePath: getResourcePath() });
  if (!reg) return null;
  const session = startedSessions.get(sessionKey(reg.id, root));
  return session ? session.serverId : null;
}

function getPositionEncoding(serverId) {
  return encodingByServerId.get(serverId) || 'utf-16';
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
  if (!scope) return null;

  const projectRoot = projectRootForEditor(editor);
  if (!projectRoot) return null;

  const reg = resolveRegistration(scope, { resourcePath: getResourcePath() });
  if (!reg) return null;

  const key = sessionKey(reg.id, projectRoot);
  if (startedSessions.has(key)) {
    return startedSessions.get(key).serverId;
  }

  const trusted = await ipcRenderer.invoke('lsp:is-trusted', { projectRoot });
  if (!trusted) {
    emitter.emit('did-change-trust-needed', { projectRoot });
    return null;
  }

  const resolved = resolveCommand(reg);
  if (!resolved) {
    emitter.emit('did-fail-start', {
      projectRoot,
      message: `Language server "${reg.id}" command not found on PATH: ${reg.command}`
    });
    return null;
  }

  const serverId = `${reg.id}:${projectRoot}`;
  try {
    await ipcRenderer.invoke('lsp:start-server', {
      serverId,
      projectRoot,
      command: resolved.command,
      args: resolved.args || [],
      rootUri: pathToUri(projectRoot),
      cwd: projectRoot,
      initializationOptions: resolved.initializationOptions,
      env: resolved.env
    });
    startedSessions.set(key, {
      serverId,
      projectRoot,
      regId: reg.id,
      positionEncoding: 'utf-16',
      source: reg.source
    });
    encodingByServerId.set(serverId, 'utf-16');
    emitter.emit('did-start-server', {
      serverId,
      projectRoot,
      regId: reg.id,
      source: reg.source
    });
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

  if (msg.type === 'server-initialized') {
    if (msg.serverId && msg.positionEncoding) {
      encodingByServerId.set(msg.serverId, msg.positionEncoding);
      for (const session of startedSessions.values()) {
        if (session.serverId === msg.serverId) {
          session.positionEncoding = msg.positionEncoding;
          session.capabilities = msg.capabilities;
        }
      }
    }
    if (emitter) emitter.emit('did-server-initialized', msg);
    return;
  }

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
    for (const [key, session] of [...startedSessions]) {
      if (session.serverId === msg.serverId) {
        startedSessions.delete(key);
        encodingByServerId.delete(msg.serverId);
      }
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

async function signatureHelpAtCursor(editor, point) {
  return signatureHelpAt(clientApi, editor, point);
}

async function referencesAtCursor(editor, point, opts) {
  return referencesAt(clientApi, editor, point, opts);
}

function getAutocompleteProvider() {
  return createAutocompleteProvider(clientApi);
}

function getLspService() {
  return createLspService();
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
            env.notifications.addInfo(
              'Project untrusted; language servers stopped for new files'
            );
        },
        'chevron-lsp:status': async () => {
          const servers = await ipcRenderer.invoke('lsp:list-servers');
          const trusted = await ipcRenderer.invoke('lsp:list-trusted');
          const regs = listRegistrations({ resourcePath: getResourcePath() });
          const lat = getCompletionLatencyStats();
          const latLine =
            lat.n > 0
              ? `Completion latency (n=${lat.n}): p50=${lat.p50}ms p95=${lat.p95}ms mean=${lat.mean}ms`
              : 'Completion latency: no samples yet';
          const lines = [
            `Trusted roots: ${trusted.length}`,
            ...trusted.map(r => `  • ${r}`),
            `Registrations: ${regs.length}`,
            ...regs.map(
              r => `  • ${r.id} [${r.source}] scopes=${r.scopes.join(',')}`
            ),
            `Running servers: ${servers.length}`,
            ...servers.map(s => {
              const enc = encodingByServerId.get(s.serverId) || '?';
              return `  • ${s.serverId} state=${s.state} pid=${s.pid || '?'} encoding=${enc}`;
            }),
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
        },
        'chevron-lsp:signature-help': async () => {
          const editor = env.workspace.getActiveTextEditor();
          if (!editor) return;
          await ensureServerForEditor(editor);
          if (documentSync) documentSync.observeEditor(editor);
          const help = await signatureHelpAtCursor(editor);
          emitter.emit('did-request-signature-help', { editor, help });
        },
        'chevron-lsp:find-references': async () => {
          const editor = env.workspace.getActiveTextEditor();
          if (!editor) return;
          await ensureServerForEditor(editor);
          if (documentSync) documentSync.observeEditor(editor);
          const locations = await referencesAtCursor(editor);
          emitter.emit('did-request-references', { editor, locations });
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
  startedSessions.clear();
  encodingByServerId.clear();
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

function onDidRequestSignatureHelp(cb) {
  return emitter.on('did-request-signature-help', cb);
}

function onDidRequestReferences(cb) {
  return emitter.on('did-request-references', cb);
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
  onDidRequestSignatureHelp,
  onDidRequestReferences,
  hoverAtCursor,
  definitionAtCursor,
  signatureHelpAtCursor,
  referencesAtCursor,
  formatSignatureHelp,
  getAutocompleteProvider,
  getLspService,
  registerServer,
  listRegistrations,
  getCompletionLatencyStats,
  request,
  getServerIdForEditor,
  getPositionEncoding,
  // test hooks
  _internals: {
    projectRootForEditor,
    diagnosticsByUri,
    startedSessions,
    /** @deprecated use startedSessions */
    get startedRoots() {
      // back-compat for lsp-ui diagnostic counting — expose empty Map shape
      return startedSessions;
    },
    encodingByServerId,
    completionLatencySamples,
    clientApi
  }
};
