'use strict';

/**
 * Renderer-side LSP client (Phases 1–4).
 * Multi-server registry, diagnostics, hover, definition, completion,
 * signature help, references, rename, format, code actions, document symbols.
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
const { prepareRename, renameAt } = require('./providers/rename');
const { formatDocument, formatRange } = require('./providers/format');
const {
  codeActionsAt,
  resolveCodeAction,
  executeCommand
} = require('./providers/code-action');
const { documentSymbols } = require('./providers/document-symbols');
const { applyWorkspaceEdit } = require('./workspace-edit');
const { createDiagnosticsService } = require('./diagnostics-service');

let activated = false;
let disposables = null;
let emitter = null;
let documentSync = null;
/** uri -> Diagnostic[] */
const diagnosticsByUri = new Map();
/** uri -> serverId that published it (for positionEncoding resolution, G7) */
const diagnosticsServerByUri = new Map();
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
/** Last why-LSP-is-idle notice so a late lsp-ui still shows it. */
let lastNotice = null;
const noticedNoServer = new Set();
const noticedTrust = new Set();

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
  if (!reg) {
    const noticeKey = `${scope}::${projectRoot}`;
    if (!noticedNoServer.has(noticeKey)) {
      noticedNoServer.add(noticeKey);
      lastNotice = {
        kind: 'no-server',
        scope,
        projectRoot,
        message:
          `No language server for ${scope}. Install chevron-lsp-typescript, ` +
          `chevron-lsp-rust, or chevron-lsp-python with cpm ` +
          `(see docs/reference/lsp-server-distribution.md), or put the server on PATH. ` +
          `Then run "Chevron Lsp: Trust Project".`
      };
      emitter.emit('did-no-server', lastNotice);
    }
    return null;
  }

  const key = sessionKey(reg.id, projectRoot);
  if (startedSessions.has(key)) {
    return startedSessions.get(key).serverId;
  }

  const trusted = await ipcRenderer.invoke('lsp:is-trusted', { projectRoot });
  if (!trusted) {
    if (!noticedTrust.has(projectRoot)) {
      noticedTrust.add(projectRoot);
      lastNotice = { kind: 'trust-needed', projectRoot };
      emitter.emit('did-change-trust-needed', { projectRoot });
    }
    return null;
  }

  const resolved = resolveCommand(reg);
  if (!resolved) {
    lastNotice = {
      kind: 'fail-start',
      projectRoot,
      message: `Language server "${reg.id}" command not found on PATH: ${reg.command}`
    };
    emitter.emit('did-fail-start', lastNotice);
    return null;
  }

  const serverId = `${reg.id}:${projectRoot}`;
  try {
    // Package-registered servers are unknown to main until declared, since
    // main validates commands against sources it can read itself
    // (lsp-command-policy). Builtin/user-config servers need no declaration.
    if (reg.source === 'package') {
      await ipcRenderer.invoke('lsp:register-server', {
        id: reg.id,
        command: resolved.command
      });
    }
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
    lastNotice = {
      kind: 'fail-start',
      projectRoot,
      message: err.message,
      code: err.code
    };
    emitter.emit('did-fail-start', lastNotice);
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
    // Crash restart: re-open open buffers so the new process has document state
    if (msg.restarted && documentSync) {
      try {
        documentSync.resyncAll();
      } catch (_) {
        /* ignore */
      }
    }
    if (emitter) emitter.emit('did-server-initialized', msg);
    return;
  }

  if (msg.type === 'server-restarting') {
    if (emitter) emitter.emit('did-server-restarting', msg);
    return;
  }

  if (msg.type === 'notification' && msg.method === 'textDocument/publishDiagnostics') {
    const uri = msg.params && msg.params.uri;
    const diagnostics = (msg.params && msg.params.diagnostics) || [];
    if (uri) {
      diagnosticsByUri.set(uri, diagnostics);
      if (msg.serverId) diagnosticsServerByUri.set(uri, msg.serverId);
      emitter.emit('did-publish-diagnostics', { uri, diagnostics });
    }
    return;
  }

  if (msg.type === 'server-request') {
    handleServerRequest(msg).catch(err => {
      ipcRenderer
        .invoke('lsp:respond', {
          serverId: msg.serverId,
          id: msg.id,
          error: { code: -32603, message: err.message || String(err) }
        })
        .catch(() => {});
    });
    return;
  }

  if (msg.type === 'server-exit') {
    // Keep session if host will restart (G5 supervision)
    if (!msg.willRestart) {
      for (const [key, session] of [...startedSessions]) {
        if (session.serverId === msg.serverId) {
          startedSessions.delete(key);
          encodingByServerId.delete(msg.serverId);
        }
      }
    }
    if (emitter) emitter.emit('did-server-exit', msg);
  }
}

async function handleServerRequest(msg) {
  if (msg.method === 'workspace/applyEdit') {
    const edit = msg.params && msg.params.edit;
    const result = await applyWorkspaceEdit(edit, {
      env: global.chevron,
      getEncodingForUri: () => encodingByServerId.get(msg.serverId) || 'utf-16'
    });
    await ipcRenderer.invoke('lsp:respond', {
      serverId: msg.serverId,
      id: msg.id,
      result: {
        applied: result.ok,
        failureReason: result.ok ? undefined : result.error
      }
    });
    return;
  }
  // Unsupported server request — decline gracefully
  await ipcRenderer.invoke('lsp:respond', {
    serverId: msg.serverId,
    id: msg.id,
    error: { code: -32601, message: `Method not handled: ${msg.method}` }
  });
}

async function applyEdit(edit, serverId) {
  return applyWorkspaceEdit(edit, {
    env: global.chevron,
    getEncodingForUri: () =>
      (serverId && encodingByServerId.get(serverId)) || 'utf-16'
  });
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

async function prepareRenameAtCursor(editor, point) {
  return prepareRename(clientApi, editor, point);
}

async function renameAtCursor(editor, newName, point) {
  const edit = await renameAt(clientApi, editor, newName, point);
  if (!edit) return { ok: false, error: 'Rename failed or unsupported' };
  const serverId = getServerIdForEditor(editor);
  return applyEdit(edit, serverId);
}

async function formatDocumentAt(editor) {
  return formatDocument(clientApi, editor);
}

async function formatRangeAt(editor, range) {
  return formatRange(clientApi, editor, range);
}

async function codeActionsAtCursor(editor, range) {
  const uri = editor.getPath && pathToUri(editor.getPath());
  const diags = uri ? getDiagnostics(uri) : [];
  return codeActionsAt(clientApi, editor, range, diags);
}

async function applyCodeAction(editor, action) {
  let resolved = action;
  if (action && !action.edit) {
    resolved = await resolveCodeAction(clientApi, editor, action);
  }
  if (resolved && resolved.edit) {
    const serverId = getServerIdForEditor(editor);
    const applied = await applyEdit(resolved.edit, serverId);
    if (!applied.ok) return applied;
  }
  if (resolved && resolved.command) {
    return executeCommand(clientApi, editor, resolved.command);
  }
  return { ok: true };
}

async function documentSymbolsAt(editor) {
  return documentSymbols(clientApi, editor);
}

function getAutocompleteProvider() {
  return createAutocompleteProvider(clientApi);
}

function getLspService() {
  return createLspService();
}

function getDiagnosticsService() {
  if (!emitter) {
    // Allow service construction after activate; create a no-op emitter shape
    const { Emitter } = require('event-kit');
    emitter = new Emitter();
  }
  return createDiagnosticsService(diagnosticsByUri, emitter, uri => {
    const serverId = diagnosticsServerByUri.get(uri);
    return (serverId && encodingByServerId.get(serverId)) || 'utf-16';
  });
}

function isFormatOnSaveEnabled() {
  const env = global.chevron;
  if (!env || !env.config) return false;
  try {
    return Boolean(env.config.get('lsp.formatOnSave'));
  } catch (_) {
    return false;
  }
}

function observeFormatOnSave(editor) {
  if (!editor || !editor.getBuffer) return null;
  const buffer = editor.getBuffer();
  if (!buffer || !buffer.onWillSave) return null;
  return buffer.onWillSave(async () => {
    if (!isFormatOnSaveEnabled()) return;
    if (!getServerIdForEditor(editor)) return;
    try {
      await formatDocument(clientApi, editor);
    } catch (_) {
      /* never block save */
    }
  });
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

  const env = global.chevron;
  if (env && env.workspace) {
    disposables.add(
      env.workspace.observeTextEditors(async editor => {
        const serverId = await ensureServerForEditor(editor);
        if (serverId) documentSync.observeEditor(editor);
        const fos = observeFormatOnSave(editor);
        if (fos) disposables.add(fos);
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
          emitter.emit('did-request-trust-prompt', { projectRoot: root, force: true });
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
        },
        'chevron-lsp:rename': async () => {
          const editor = env.workspace.getActiveTextEditor();
          if (!editor) return;
          await ensureServerForEditor(editor);
          if (documentSync) documentSync.observeEditor(editor);
          const prep = await prepareRenameAtCursor(editor);
          if (!prep) {
            env.notifications &&
              env.notifications.addInfo('Rename not available here');
            return;
          }
          emitter.emit('did-request-rename', { editor, prepare: prep });
        },
        'chevron-lsp:format-document': async () => {
          const editor = env.workspace.getActiveTextEditor();
          if (!editor) return;
          await ensureServerForEditor(editor);
          if (documentSync) documentSync.observeEditor(editor);
          const result = await formatDocumentAt(editor);
          if (!result.ok && env.notifications) {
            env.notifications.addWarning(
              `Format failed: ${result.error || 'unknown'}`
            );
          } else if (result.edits === 0 && env.notifications) {
            env.notifications.addInfo('Already formatted');
          }
        },
        'chevron-lsp:format-selection': async () => {
          const editor = env.workspace.getActiveTextEditor();
          if (!editor) return;
          await ensureServerForEditor(editor);
          if (documentSync) documentSync.observeEditor(editor);
          await formatRangeAt(editor);
        },
        'chevron-lsp:code-actions': async () => {
          const editor = env.workspace.getActiveTextEditor();
          if (!editor) return;
          await ensureServerForEditor(editor);
          if (documentSync) documentSync.observeEditor(editor);
          const actions = await codeActionsAtCursor(editor);
          emitter.emit('did-request-code-actions', { editor, actions });
        },
        'chevron-lsp:document-symbols': async () => {
          const editor = env.workspace.getActiveTextEditor();
          if (!editor) return;
          await ensureServerForEditor(editor);
          if (documentSync) documentSync.observeEditor(editor);
          const symbols = await documentSymbolsAt(editor);
          emitter.emit('did-request-document-symbols', { editor, symbols });
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
  diagnosticsServerByUri.clear();
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

function onDidRequestTrustPrompt(cb) {
  return emitter.on('did-request-trust-prompt', cb);
}

function onDidFailStart(cb) {
  return emitter.on('did-fail-start', cb);
}

function onDidNoServer(cb) {
  return emitter.on('did-no-server', cb);
}

function getPendingNotice() {
  return lastNotice;
}

async function getTrustState(projectRoot) {
  return ipcRenderer.invoke('lsp:get-trust-state', { projectRoot });
}

async function recordTrustDecision(projectRoot, trusted) {
  return ipcRenderer.invoke('lsp:set-trust', { projectRoot, trusted });
}

async function startServersForOpenEditors() {
  const env = global.chevron;
  if (!env || !env.workspace || !documentSync) return;
  for (const editor of env.workspace.getTextEditors()) {
    const serverId = await ensureServerForEditor(editor);
    if (serverId) documentSync.observeEditor(editor);
  }
}

function onDidServerExit(cb) {
  return emitter.on('did-server-exit', cb);
}

function onDidServerRestarting(cb) {
  return emitter.on('did-server-restarting', cb);
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

function onDidRequestRename(cb) {
  return emitter.on('did-request-rename', cb);
}

function onDidRequestCodeActions(cb) {
  return emitter.on('did-request-code-actions', cb);
}

function onDidRequestDocumentSymbols(cb) {
  return emitter.on('did-request-document-symbols', cb);
}

module.exports = {
  activate,
  deactivate,
  getDiagnostics,
  getDiagnosticsService,
  onDidPublishDiagnostics,
  onDidChangeTrustNeeded,
  onDidRequestTrustPrompt,
  getTrustState,
  recordTrustDecision,
  startServersForOpenEditors,
  onDidFailStart,
  onDidNoServer,
  getPendingNotice,
  onDidServerExit,
  onDidServerRestarting,
  onDidRequestHover,
  onDidRequestDefinition,
  onDidRequestSignatureHelp,
  onDidRequestReferences,
  onDidRequestRename,
  onDidRequestCodeActions,
  onDidRequestDocumentSymbols,
  hoverAtCursor,
  definitionAtCursor,
  signatureHelpAtCursor,
  referencesAtCursor,
  prepareRenameAtCursor,
  renameAtCursor,
  formatDocumentAt,
  formatRangeAt,
  codeActionsAtCursor,
  applyCodeAction,
  documentSymbolsAt,
  applyEdit,
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
    clientApi,
    get lastNotice() {
      return lastNotice;
    },
    resetNotices() {
      lastNotice = null;
      noticedNoServer.clear();
      noticedTrust.clear();
    }
  }
};
